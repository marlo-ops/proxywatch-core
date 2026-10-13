// rpc.mjs — JSON-RPC client with endpoint failover.
// No API keys required for the default public endpoints.

const DEFAULT_ENDPOINTS = {
  ethereum: [
    "https://ethereum-rpc.publicnode.com",
    "https://rpc.ankr.com/eth",
    "https://eth.drpc.org",
  ],
  base: [
    "https://base-rpc.publicnode.com",
    "https://mainnet.base.org",
    "https://base.drpc.org",
  ],
  arbitrum: [
    "https://arbitrum-one-rpc.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
  ],
  optimism: [
    "https://optimism-rpc.publicnode.com",
    "https://mainnet.optimism.io",
  ],
};

export function endpointsFor(chain, extra = []) {
  const base = DEFAULT_ENDPOINTS[chain] || [];
  return [...extra, ...base];
}

export class Rpc {
  constructor(urls, { timeoutMs = 12000 } = {}) {
    if (!urls || !urls.length) throw new Error("Rpc: no endpoints");
    this.urls = urls;
    this.timeoutMs = timeoutMs;
    this.pinned = 0;
    this._id = 1;
  }

  async call(method, params = []) {
    let lastErr;
    for (let i = 0; i < this.urls.length; i++) {
      const idx = (this.pinned + i) % this.urls.length;
      const url = this.urls[idx];
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: this._id++, method, params }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const json = await res.json();
        if (json.error) throw new Error(json.error.message || "rpc error");
        this.pinned = idx; // stay on a working endpoint
        return json.result;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`all RPC endpoints failed for ${method}: ${lastErr?.message}`);
  }

  blockNumber() {
    return this.call("eth_blockNumber").then((h) => Number(BigInt(h)));
  }
  getCode(addr) {
    return this.call("eth_getCode", [addr, "latest"]);
  }
  getStorageAt(addr, slot) {
    return this.call("eth_getStorageAt", [addr, slot, "latest"]);
  }
  getLogs(filter) {
    return this.call("eth_getLogs", [filter]);
  }
}
