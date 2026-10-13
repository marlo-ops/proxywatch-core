#!/usr/bin/env node
// proxywatch-core — classify a contract's upgrade surface. Read-only.
//   node bin/proxywatch-core.mjs 0xAddress [chain]
import { Rpc, endpointsFor } from "../src/rpc.mjs";
import { readSurface } from "../src/chain.mjs";

const [, , address, chain = "ethereum"] = process.argv;
if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error("usage: node bin/proxywatch-core.mjs 0xAddress [ethereum|base|arbitrum|optimism]");
  process.exit(2);
}

const rpc = new Rpc(endpointsFor(chain));
const s = await readSurface(rpc, address);
const verdict =
  !s.isProxy ? "not an EIP-1967 proxy (may still be upgradeable via another pattern)"
  : s.adminKind === "EOA" ? "CRITICAL — single-key upgrade authority"
  : s.adminKind === "contract" ? "upgradeable, admin is a contract (multisig/timelock likely)"
  : "upgradeable, admin slot empty (authority mechanism not visible here)";

console.log(JSON.stringify({ chain, ...s, verdict }, null, 2));
