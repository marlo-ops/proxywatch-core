# proxywatch-core

**Read the upgrade surface of any contract, from a public RPC, in one command.**

No API keys. No dependencies. No writes. ~200 lines you can read in full.

```bash
node bin/proxywatch-core.mjs 0x87870Bca3F3fD6335C3F4CE8392D69350B4fA4E2 ethereum
```

```json
{
  "chain": "ethereum",
  "isProxy": true,
  "implementation": "0x728a138a4823392c2efa55e028d434f526fe03cf",
  "admin": null,
  "adminKind": "none",
  "beacon": null,
  "severity": "info",
  "verdict": "upgradeable, admin slot empty (authority mechanism not visible here)"
}
```

## The question it answers

Every upgradeable contract has a **control surface**: the slots and roles that
decide what the contract will do *tomorrow*. Change the implementation address
behind a proxy and you change all of the logic. Change the admin and you change
who is allowed to do that.

This tool reads that surface and tells you whether the authority behind a
contract is a **contract** (typically a multisig or timelock — slow, visible) or
an **externally-owned account** (one key, no delay).

## What it reads

| Signal | Source |
|---|---|
| Implementation, admin, beacon | EIP-1967 storage slots |
| Admin type (contract vs EOA) | `eth_getCode` on the admin address |
| Upgrade / admin / ownership events | `Upgraded`, `AdminChanged`, `OwnershipTransferred` logs |

Chains: `ethereum`, `base`, `arbitrum`, `optimism`. Public endpoints by default,
with failover.

## What it does **not** do

- It reads the **standard EIP-1967 slots only**. UUPS, beacon and Diamond proxies
  are not classified here and may show as "not an EIP-1967 proxy".
- It performs **no attribution** — an address is an address.
- It is **not an audit**, not security advice, and makes no claim that a contract
  is safe. A clean result means "nothing found", not "nothing there".

## Why the numbers matter

Single-key admins are **not** as common as the security industry implies, and
they are highly concentrated:

- Across **1,184 live proxies** on Ethereum and Base, **6.4%** of those exposing a
  discoverable admin still use an EOA admin.
- The same classifier returns **1.9% / 26.7% / 8.7%** on three different slices of
  the same data.
- Concentration is the point: **22 of 27** Ethereum EOA-admin proxies are
  `AdminUpgradeabilityProxy`.

The full method, counts, caveats and reproduction steps are in
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md). Read
[`docs/LIMITS.md`](docs/LIMITS.md) before relying on any of this.

## Design notes

- **Zero dependencies.** Node 20+, standard library only.
- **Read-only by construction.** `eth_getStorageAt`, `eth_getCode`, `eth_call`,
  `eth_getLogs`, `eth_blockNumber` — nothing else, ever.
- **No keys, no accounts, no cost.** Public RPC endpoints with failover.
- **One implementation.** The hosted product imports this same detector; there is
  no divergent fork.

## If you want this on a schedule

This CLI is a snapshot. The same logic runs continuously in the hosted product —
watching a set of contracts, alerting on change with severity, a diff, and the
block and transaction behind it. That's the thing worth paying for; the detector
is the sample.

## Licence

MIT.
