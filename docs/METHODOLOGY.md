# Methodology — proxy admin prevalence

How the headline numbers were produced, and how to reproduce them.

## Question

How often does a live upgradeable proxy still put upgrade authority on a
**single externally-owned account** — one key, no multisig, no timelock?

This matters because the headline pitch in on-chain security is "we catch the
single-key admin". That pitch assumes the condition is *common*. It is worth
checking rather than asserting.

## Method

1. **Enumerate.** Proxy candidates by exact contract-name match via the free
   Blockscout v2 API — names `TransparentUpgradeableProxy`, `ERC1967Proxy`,
   `AdminUpgradeabilityProxy` — four pages each, de-duplicated:
   **600 candidates per chain**.
2. **Classify.** For each candidate, over public JSON-RPC:
   - read the EIP-1967 implementation, admin and beacon storage slots;
   - `admin = EOA` ⇔ the admin slot is non-zero **and** `eth_getCode(admin) = 0x`;
   - `admin = contract` ⇔ admin slot non-zero and code present;
   - `admin slot empty` ⇔ proxy, admin slot zero.
3. **Compare slices.** Run the *same classifier* against differently-drawn
   samples to test how much the headline number depends on sampling.

Read-only throughout. No keys, no transactions, no paid data.

## Results

| | Ethereum | Base | Combined |
|---|---|---|---|
| candidates scanned | 600 | 600 | 1,200 |
| not a proxy | 11 | 5 | 16 |
| **proxies** | 589 | 595 | **1,184** |
| admin = contract | 282 (47.9%) | 203 (34.1%) | 485 |
| **admin = EOA** | **27 (4.6%)** | **6 (1.0%)** | **33** |
| admin slot empty | 280 (47.5%) | 386 (64.9%) | 666 |
| known-admin proxies | 309 | 209 | 518 |
| **EOA of known-admin** | **8.74%** | **2.87%** | **6.37%** |

Same classifier, three slices of the same data: **1.9% / 26.7% / 8.7%**.

Snapshot blocks: Ethereum `26,176,862`; Base `52,512,203`.

## Interpretation

- The condition is **uncommon but real**, and it is **not** a property of "crypto"
  — it is a property of *which contracts you look at*.
- It is **concentrated**: 22 of 27 Ethereum EOA-admin proxies are
  `AdminUpgradeabilityProxy`. The `ERC1967Proxy` and Aave-style cohorts exposed no
  admin slot at all.
- A headline percentage without a stated sampling method is close to meaningless,
  including ours.

## Caveats

- Name-pattern and recency bias — this is **not** a random census.
- "Admin slot empty" conflates *renounced* with *unknown*.
- The Base half was enumerated through a browser because the explorer blocks
  scripted access: a single point of failure for that chain.
- `beacon present` was 0 because the sampled names do not include
  `BeaconProxy`-style contracts.

## Reproduce

Public RPC and free explorer APIs only. Pin a block, run the same steps, and you
should get the same counts — that is the entire point.
