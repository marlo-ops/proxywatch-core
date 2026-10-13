# Limits

Read this before relying on the tool or the numbers.

## The tool

- **Standard EIP-1967 slots only.** UUPS has no admin slot by design; beacon and
  Diamond proxies use other mechanisms. All of them may appear here as "not an
  EIP-1967 proxy" or "admin slot empty". Absence of a finding is not absence of
  upgradeability.
- **Heuristics are labelled as such.** Where a classification is inferred (for
  example a UUPS-style implementation), it is marked and carries the method used.
- **No attribution.** The tool does not label, cluster or identify counterparties.
  An address is an address.
- **Public RPC endpoints are not archives.** An old block range can return an
  empty result on a non-archive endpoint. Empty is not proof.

## The numbers

- **Not a random census.** Samples were drawn by contract-name match and recency
  ordering. Different draws give materially different rates — we measured
  1.9% / 26.7% / 8.7% with the same classifier.
- **Renounced vs unknown.** An empty admin slot does not tell you whether
  authority was deliberately renounced or simply lives elsewhere.
- **Time-bound.** Counts are as of the snapshot blocks listed in
  `METHODOLOGY.md`. Contracts change.

## What this is not

- Not an audit.
- Not security advice.
- Not insurance, and not a guarantee that any contract is safe.
- Not evidence-grade attribution, and not suitable as expert testimony.

A clean result means "nothing found". That is all it means.
