# proxywatch-core

Read-only classification of a contract's **EIP-1967 upgrade surface**: which
implementation it points at, who the admin is, and whether that authority is a
single key.

No API keys. No dependencies. No writes.

## Use

```bash
node bin/proxywatch-core.mjs 0x87870Bca3F3fD6335C3F4CE8392D69350B4fA4E2 ethereum
```

## Research

`RESEARCH-proxy-admin-prevalence.md` — measured across 1,184 live proxies on
Ethereum and Base: **6.4% of proxies that expose a discoverable admin still use a
single externally-owned account**, and the rate is highly sample-dependent. Raw
counts and method are in the file; both are reproducible.

## Limits

Standard EIP-1967 slots only. UUPS, beacon and Diamond proxies are not
classified here and may show as "not an EIP-1967 proxy". Not an audit, not
security advice. MIT licensed.
