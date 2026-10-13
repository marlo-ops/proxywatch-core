// chain.mjs — on-chain control-surface inspection + event decoding.
// Read-only. Public data only.
//
// Coverage note (2026-10-12): EIP-1967 proxies do not all expose an admin
// slot — UUPS proxies keep their upgrade logic in the implementation, beacon
// proxies keep it in the beacon, and some proxies use a nonstandard or
// immutable admin. This module detects the beacon slot, classifies the
// authority surface, and uses a clearly-labelled HEURISTIC on implementation
// bytecode to separate UUPS from a plain implementation. No claim here is
// stronger than the evidence field it carries.

export const ZERO = "0x0000000000000000000000000000000000000000";

// EIP-1967 storage slots
export const SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};

// Event topics
export const TOPICS = {
  // event Upgraded(address indexed implementation)
  upgraded: "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b",
  // event AdminChanged(address previousAdmin, address newAdmin)
  adminChanged: "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f",
  // event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
  ownershipTransferred: "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0",
};

// Function selectors we probe (read-only eth_call / bytecode scan).
export const SELECTORS = {
  admin: "f851a440", // admin()
  changeAdmin: "8f283970", // changeAdmin(address)
  implementation: "5c60da1b", // implementation()
  upgradeTo: "3659cfe6", // upgradeTo(address)            — UUPSUpgradeable
  upgradeToAndCall: "4f1ef286", // upgradeToAndCall(address,bytes) — UUPSUpgradeable
  proxiableUUID: "52d1902d", // proxiableUUID()              — ERC1822/UUPS
  owner: "8da5cb5b", // owner()
};

const addrFromSlot = (hex) => "0x" + String(hex).slice(-40).toLowerCase();

/** Best-effort read-only eth_call that resolves a 32-byte address return value. */
async function safeCallAddress(rpc, to, selector) {
  try {
    const res = await rpc.call("eth_call", [{ to, data: selector }, "latest"]);
    if (!res || res === "0x") return null;
    const addr = addrFromSlot(res);
    return addr === ZERO ? null : addr;
  } catch {
    return null; // reverts / nonstandard contracts are expected here
  }
}

/** Which of the probed selectors appear anywhere in the bytecode. */
export function scanSelectors(codeHex) {
  const code = String(codeHex || "").toLowerCase();
  const hit = {};
  for (const [k, s] of Object.entries(SELECTORS)) hit[k] = code.includes(s);
  return hit;
}

/**
 * HEURISTIC: does this implementation bytecode look like an OpenZeppelin-style
 * UUPS implementation (upgrade logic lives in the implementation)?
 * We require at least two of the three UUPS entrypoints to reduce false hits
 * from a 4-byte sequence that merely appears in push data.
 * This is a guess from bytecode, not proof — callers MUST label it as such.
 */
export function detectUupsSelectors(codeHex) {
  const h = scanSelectors(codeHex);
  const hits = { upgradeTo: h.upgradeTo, upgradeToAndCall: h.upgradeToAndCall, proxiableUUID: h.proxiableUUID };
  const count = [hits.upgradeTo, hits.upgradeToAndCall, hits.proxiableUUID].filter(Boolean).length;
  return { ...hits, count, isUups: count >= 2 };
}

/**
 * Pure classifier. Takes already-resolved signals (no I/O) and returns the
 * control-surface authority classification. Exercised offline by test/test.mjs.
 *
 * sig = {
 *   isProxy, hasImpl, hasAdmin, adminKind,   // adminKind: "none" | "EOA" | "contract"
 *   hasBeacon, beaconOwnerKind,              // "EOA" | "contract" | "unknown" | null
 *   proxySelectors,                          // scanSelectors() of the proxy bytecode
 *   uups,                                    // detectUupsSelectors() or null
 *   uupsOwnerKind,                           // "EOA" | "contract" | "unknown" | null
 * }
 */
export function classifySurface(sig) {
  const {
    isProxy, hasAdmin, adminKind,
    hasBeacon, beaconOwnerKind,
    proxySelectors = {}, uups = null, uupsOwnerKind = null,
  } = sig;

  if (!isProxy) {
    return {
      proxyKind: "none",
      authority: "immutable",
      controllerKind: "n/a",
      authorityHeuristic: false,
      authorityLabel: "not a proxy — immutable code",
      authorityEvidence: "no EIP-1967 implementation, admin, or beacon slot set",
    };
  }

  if (hasBeacon) {
    const ownerKind = beaconOwnerKind || "unknown";
    return {
      proxyKind: "beacon",
      authority: "beacon",
      controllerKind: ownerKind,
      authorityHeuristic: false,
      authorityLabel:
        ownerKind === "unknown"
          ? "beacon proxy — beacon identified, controller not resolved"
          : `beacon proxy — controlled by the beacon (${ownerKind === "EOA" ? "EOA owner" : "contract owner"})`,
      authorityEvidence: "EIP-1967 beacon slot set",
    };
  }

  if (hasAdmin) {
    const isEoa = adminKind === "EOA";
    return {
      proxyKind: "transparent",
      authority: isEoa ? "eoa" : "contract",
      controllerKind: isEoa ? "EOA" : "contract",
      authorityHeuristic: false,
      authorityLabel: isEoa ? "single-key EOA admin (critical)" : "contract admin (multisig/timelock)",
      authorityEvidence: "EIP-1967 admin slot set",
    };
  }

  // Implementation slot set, but no admin slot and no beacon.
  const proxyHasAdminIface =
    proxySelectors.admin || proxySelectors.changeAdmin || (proxySelectors.implementation && proxySelectors.upgradeTo);
  const hasUpgradeEntry = proxySelectors.upgradeTo || proxySelectors.upgradeToAndCall;

  if (uups && uups.isUups) {
    const ck = uupsOwnerKind === "EOA" || uupsOwnerKind === "contract" ? uupsOwnerKind : "unknown";
    return {
      proxyKind: "uups",
      authority: "uups",
      controllerKind: ck,
      authorityHeuristic: true,
      authorityLabel:
        ck === "unknown"
          ? "UUPS upgradeable (HEURISTIC) — controller not resolved"
          : `UUPS upgradeable (HEURISTIC) — controlled by an ${ck === "EOA" ? "EOA" : "contract"}`,
      authorityEvidence:
        "no EIP-1967 admin slot; implementation bytecode exposes upgradeTo/upgradeToAndCall/proxiableUUID (heuristic)",
    };
  }

  if (proxyHasAdminIface && hasUpgradeEntry) {
    return {
      proxyKind: "eip1967",
      authority: "unknown",
      controllerKind: "unknown",
      authorityHeuristic: false,
      authorityLabel: "upgradeable proxy — authority not stored in the EIP-1967 admin slot",
      authorityEvidence:
        "no EIP-1967 admin slot; proxy bytecode exposes an admin/implementation interface (nonstandard or immutable admin)",
    };
  }

  return {
    proxyKind: "eip1967",
    authority: "renounced",
    controllerKind: "unknown",
    authorityHeuristic: true,
    authorityLabel: "renounced/immutable (HEURISTIC) — no discoverable upgrade authority",
    authorityEvidence:
      "no EIP-1967 admin slot, no beacon, and no standard UUPS upgrade entrypoint in the implementation (heuristic)",
  };
}

/** Severity from the classified surface. Single-key controllers are critical. */
export function severityFor(surface) {
  if (!surface.isProxy) return "info";
  if (surface.authority === "eoa" || surface.controllerKind === "EOA") return "critical";
  return "info";
}

/**
 * Read the static control surface of a contract.
 * Returns null fields where not applicable. All classification is derived from
 * public reads only; fields built from bytecode inspection are marked heuristic.
 */
export async function readSurface(rpc, address) {
  const [implHex, adminHex, beaconHex] = await Promise.all([
    rpc.getStorageAt(address, SLOTS.implementation),
    rpc.getStorageAt(address, SLOTS.admin),
    rpc.getStorageAt(address, SLOTS.beacon),
  ]);

  const implementationSlot = addrFromSlot(implHex);
  const adminSlot = addrFromSlot(adminHex);
  const beacon = addrFromSlot(beaconHex);
  const hasImpl = implementationSlot !== ZERO;
  const hasAdmin = adminSlot !== ZERO;
  const hasBeacon = beacon !== ZERO;
  const isProxy = hasImpl || hasAdmin || hasBeacon;

  let adminKind = "none";
  if (hasAdmin) {
    const code = await rpc.getCode(adminSlot);
    adminKind = code === "0x" ? "EOA" : "contract";
  }

  // Beacon proxies: resolve the implementation and the controller via the beacon.
  let beaconImplementation = null;
  let beaconOwner = null;
  let beaconOwnerKind = null;
  if (hasBeacon) {
    beaconImplementation = await safeCallAddress(rpc, beacon, SELECTORS.implementation);
    beaconOwner = await safeCallAddress(rpc, beacon, SELECTORS.owner);
    if (beaconOwner) beaconOwnerKind = (await rpc.getCode(beaconOwner)) === "0x" ? "EOA" : "contract";
    else beaconOwnerKind = "unknown";
  }

  // No admin slot, no beacon: probe the implementation (and the proxy) to
  // separate UUPS from a plain implementation — heuristic, bytecode-based.
  let uups = null;
  let uupsOwner = null;
  let uupsOwnerKind = null;
  let proxySelectors = {};
  if (isProxy && hasImpl && !hasAdmin && !hasBeacon) {
    uups = detectUupsSelectors(await rpc.getCode(implementationSlot));
    proxySelectors = scanSelectors(await rpc.getCode(address));
    if (uups.isUups) {
      uupsOwner = await safeCallAddress(rpc, address, SELECTORS.owner);
      if (uupsOwner) uupsOwnerKind = (await rpc.getCode(uupsOwner)) === "0x" ? "EOA" : "contract";
      else uupsOwnerKind = "unknown";
    }
  }

  const classification = classifySurface({
    isProxy, hasImpl, hasAdmin, adminKind,
    hasBeacon, beaconOwnerKind,
    proxySelectors, uups, uupsOwnerKind,
  });

  const implementation = hasImpl ? implementationSlot : beaconImplementation;

  const surface = {
    address: address.toLowerCase(),
    isProxy,
    proxyKind: classification.proxyKind,
    implementation: implementation || null,
    implementationSlot: hasImpl ? implementationSlot : null,
    admin: hasAdmin ? adminSlot : null,
    adminKind,
    beacon: hasBeacon ? beacon : null,
    beaconImplementation,
    beaconOwner,
    // HEURISTIC: bytecode-derived implementation profile.
    implementationProfile: uups ? (uups.isUups ? "uups-heuristic" : "no-uups-selectors") : null,
    uupsSelectors: uups
      ? { upgradeTo: uups.upgradeTo, upgradeToAndCall: uups.upgradeToAndCall, proxiableUUID: uups.proxiableUUID, count: uups.count }
      : null,
    // authority determination
    authority: classification.authority,
    controllerKind: classification.controllerKind,
    authorityLabel: classification.authorityLabel,
    authorityEvidence: classification.authorityEvidence,
    authorityHeuristic: classification.authorityHeuristic,
  };
  surface.severity = severityFor(surface);
  return surface;
}

/**
 * Fetch control-surface related logs for a block range.
 */
export async function readEvents(rpc, address, fromBlock, toBlock) {
  const logs = await rpc.getLogs({
    address,
    fromBlock: "0x" + fromBlock.toString(16),
    toBlock: "0x" + toBlock.toString(16),
    topics: [[TOPICS.upgraded, TOPICS.adminChanged, TOPICS.ownershipTransferred]],
  });

  const kindOf = (t0) =>
    t0 === TOPICS.upgraded ? "Upgraded" : t0 === TOPICS.adminChanged ? "AdminChanged" : "OwnershipTransferred";

  return logs.map((l) => ({
    kind: kindOf(l.topics[0]),
    blockNumber: Number(BigInt(l.blockNumber)),
    txHash: l.transactionHash,
    topics: l.topics,
    data: l.data,
  }));
}

export function describeEvent(ev) {
  const word = (i) => (ev.topics[i] ? addrFromSlot(ev.topics[i]) : null);
  switch (ev.kind) {
    case "Upgraded":
      return `implementation upgraded to ${word(1)}`;
    case "AdminChanged": {
      const prev = "0x" + ev.data.slice(2, 66).slice(-40);
      const next = "0x" + ev.data.slice(66, 130).slice(-40);
      return `admin changed ${prev} -> ${next}`;
    }
    case "OwnershipTransferred":
      return `ownership transferred ${word(1)} -> ${word(2)}`;
    default:
      return ev.kind;
  }
}
