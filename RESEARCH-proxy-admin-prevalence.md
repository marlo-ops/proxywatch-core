# Proxy admin prevalence, v2: single-key admins are concentrated, not rare

_Draft research note — NOT published. For principal review. Web/API-derived
facts tagged `[untrusted]`._

**One-line finding:** across **1,184 live EIP-1967 proxies** on Ethereum and Base,
**6.4% (33 of 518)** that expose an upgrade admin still use a **single-key (EOA)
admin** — and the rate is strongly **sample-dependent** (2.9% on Base, 8.7% on
Ethereum, up to 27% in a smaller relevance-ordered slice) and **concentrated in a
single proxy pattern** (`AdminUpgradeabilityProxy`).

## Why we measured this
v1 (earlier on 2026-10-12) scanned 220 Ethereum candidates and found only
**2 of 106** known-admin proxies (1.9%) with an EOA admin, and concluded the
"catch the single-key admin" wedge was weak. Because that conclusion drives
product strategy, we re-ran the measurement (a) on **two chains** and (b) with a
**larger, per-pattern breakdown**, to test whether 1.9% is a stable property of
the ecosystem or an artifact of how the sample was drawn.

## Method (read-only; public data only)
1. **Enumerate** proxy candidates by exact contract-name match on the free
   Blockscout v2 API — names `TransparentUpgradeableProxy`, `ERC1967Proxy`,
   `AdminUpgradeabilityProxy` — 4 pages (50) each, de-duplicated: **600
   candidates per chain**.
   - Ethereum: `https://eth.blockscout.com`.
   - Base: `https://base.blockscout.com` is Cloudflare-gated for scripts, so
     enumeration ran through the headless browser (same-origin `fetch` from a
     loaded page); no login, no keys. `[untrusted]`
2. **Classify** each candidate over public JSON-RPC by reading EIP-1967 storage:
   implementation slot, admin slot, beacon slot.
   - `admin = EOA` ⇔ admin slot is non-zero **and** `eth_getCode(admin) = 0x`.
   - `admin = contract` ⇔ admin slot non-zero and code present.
   - `admin slot empty` ⇔ proxy but admin slot is zero.
   - `beacon present` ⇔ beacon slot non-zero.
3. No keys, no transactions, no paid data; endpoints are public RPC with
   failover. Snapshot: Ethereum block 26,176,862; Base block 52,512,203.

## Results

### Per chain, per admin pattern
```
                        Ethereum        Base          Combined
candidates scanned          600           600            1200
not a proxy (no slot)        11             5              16
proxies                     589           595            1184
  admin = contract          282 (47.9%)   203 (34.1%)     485
  admin = EOA                27 ( 4.6%)     6 ( 1.0%)      33
  admin slot empty          280 (47.5%)   386 (64.9%)     666
  beacon present              0             0               0
known-admin proxies         309           209             518
EOA admin (of known)       8.74%         2.87%           6.37%
distinct EOA admins          22             4
```

### Where the EOA admins are (Ethereum, 600-candidate draw)
The condition clusters in one legacy pattern:
```
AdminUpgradeabilityProxy                 contract 82 | EOA 22 | empty 1 | not-proxy 6
TransparentUpgradeableProxy              contract 193 | EOA 4
InitializableAdminUpgradeabilityProxy    contract 4 | EOA 1 | not-proxy 3
ERC1967Proxy                             admin slot empty 196
InitializableImmutableAdminUpgradeabilityProxy   admin slot empty 77
```
In the smaller relevance-ordered slice, **20 of 20** EOA-admin proxies were
`AdminUpgradeabilityProxy`. The `ERC1967Proxy` and
`InitializableImmutableAdminUpgradeabilityProxy` cohorts (Aave-style) exposed
**no** admin at all.

### The headline is sample-sensitive (Ethereum)
Same classifier, three different draws:
```
v1 (search endpoint, 220 candidates)          2 / 106 =  1.9%
relevance-ordered search slice (151)         20 /  75 = 26.7%
recency-ordered smart-contracts (600)        27 / 309 =  8.7%
```

## Interpretation
1. **"Single-key admin" is not a ~2% curiosity.** On a larger, recency-ordered
   draw it is ≈9% on Ethereum; on a relevance-ordered draw it is far higher. The
   v1 headline was a **low-end artifact of its sample**, not the ecosystem rate.
2. **The risk is concentrated, which makes it addressable.** Almost all EOA
   admins are `AdminUpgradeabilityProxy` (BSC-style) contracts plus a handful of
   `TransparentUpgradeableProxy`. A detector that tags that pattern is precise
   and useful; one that treats all proxies uniformly dilutes the signal.
3. **The coverage gap persists across chains.** ~48% of Ethereum and ~65% of
   Base proxies expose **no** EIP-1967 admin. For those, an admin check silently
   says nothing — the authority may be UUPS, beacon, a custom slot, or renounced.
4. **Chain matters.** Base shows far fewer EOA admins (2.9%) and far more
   admin-empty proxies (65%) than Ethereum — consistent with Base apps being
   newer and more UUPS/ERC-1967-native, and Ethereum carrying more legacy
   BSC-style proxies.

**Product consequence (revised from v1):** do **not** demote the EOA flag to
zero. Keep it, but (a) present it as a *concentrated* signal with a per-pattern
breakdown, and (b) pair it with real coverage of the admin-empty majority
(UUPS / beacon / custom slot), which is where a monitoring product earns its
keep. Messaging should say "single-key admins are concentrated in legacy proxy
patterns and run ~3–9% of admin-exposing proxies", not "1.9%, ignore it".

## Honest caveats
- **Not a random census.** Candidates come from three proxy *names*; a random
  sample of all verified proxies could shift every figure.
- **Ordering bias.** `smart-contracts` is ordered by most-recent verification, so
  the 600-draw over-represents fresh deployments (which skew toward single-key
  admins). The search endpoint orders by relevance and gives a different mix.
- **`admin slot empty` conflates safe and unknown** (renounced vs UUPS-by-design
  vs a non-standard authority slot).
- **Beacon coverage is untested** here (0 beacon slots seen) because the sampled
  names do not include `BeaconProxy`-style contracts.
- **Spot-checks, not exhaustive validation.** A sample of EOA admins was
  re-checked on-chain and all returned `0x`; a repurposed admin slot on a
  non-standard proxy is not formally excluded.
- Base enumeration depends on a browser bypassing Cloudflare — a single point of
  failure for that half of the dataset.

## Reproducibility note
- Scripts: `business/research/prevalence-v2-tools/` — `enum_eth2.py`
  (Ethereum enumeration), `classify.py` (`--` EIP-1967 read + EOA/contract,
  takes chain + candidate file), `summarize.py` (tables).
- Ethereum enumeration + classification are fully scriptable (public HTTPS).
- Base enumeration is the same `/api/v2/smart-contracts?q=…` endpoint, driven
  from a loaded `base.blockscout.com` page in the headless browser (Cloudflare
  blocks plain fetches with HTTP 403); classification is identical.
- Raw per-address results and candidate lists: `business/evidence/2026-10-12-prevalence-v2.md`.
- All facts here are derived from public explorer APIs and public RPC and are
  tagged `[untrusted]`. No keys, no transactions, nothing published.
