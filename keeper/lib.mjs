import { createPublicClient, http, parseAbi, parseAbiItem, formatEther } from "viem";
import { CHAIN_ID, RPC, MARKET, MARKET_FROM } from "./config.mjs";

export const chain = { id: CHAIN_ID, name: "Sei Testnet", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
export const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4, retryDelay: 800 }) });
export async function assertTestnet() {
  const id = await pub.getChainId();
  if (id !== CHAIN_ID) throw new Error(`refusing to run on chain ${id} (testnet ${CHAIN_ID} only)`);
}

export const vaultAbi = parseAbi([
  "function summary() view returns (uint256 nav, uint256 seiBal, uint256 tokenBal, uint256 totalShares, uint256 pps, uint256 price, uint256 nRecs, address keeper, bool paused)",
  "struct Rec { uint32 time; uint8 kind; uint16 amount; uint64 navGwei; uint48 priceGwei; uint48 ppsNano; uint40 seiGwei; }",
  "function records(uint256 from, uint256 n) view returns (Rec[])",
  "function lastTradeAt() view returns (uint256)",
  "function minTradeInterval() view returns (uint256)",
  "function maxTradeTokens() view returns (uint256)",
  "function buy(uint256 amount, uint256 maxCost)",
  "function sell(uint256 amount, uint256 minReturn)",
  "function checkpoint()",
]);
export const marketAbi = parseAbi([
  "function quoteBuy(uint256) view returns (uint256 cost, uint256 fee)",
  "function quoteSell(uint256) view returns (uint256 gross, uint256 fee)",
]);

const bought = parseAbiItem("event Bought(address indexed buyer, uint256 amount, uint256 cost, uint256 fee)");
const sold = parseAbiItem("event Sold(address indexed seller, uint256 amount, uint256 proceeds, uint256 fee)");

/** Incrementally index PatronMarket Bought/Sold events (RPC caps getLogs at 2000 blocks). */
export async function indexFills(prev) {
  const latest = await pub.getBlockNumber();
  const from = prev?.toBlock ? BigInt(prev.toBlock) + 1n : MARKET_FROM;
  const fills = prev?.fills ? [...prev.fills] : [];
  const ranges = [];
  for (let b = from; b <= latest; b += 2000n) ranges.push([b, b + 1999n > latest ? latest : b + 1999n]);
  for (let i = 0; i < ranges.length; i += 10) {
    const res = await Promise.all(ranges.slice(i, i + 10).map(async ([f, t]) => {
      for (let k = 0; k < 5; k++) { try { return await pub.getLogs({ address: MARKET, events: [bought, sold], fromBlock: f, toBlock: t }); } catch (e) { await new Promise((r) => setTimeout(r, 1000 * (k + 1))); } }
      throw new Error(`getLogs failed ${f}-${t}`);
    }));
    for (const logs of res) for (const l of logs) {
      const a = l.args;
      fills.push({ b: Number(l.blockNumber), side: l.eventName === "Bought" ? "BUY" : "SELL", amount: Number(a.amount), sei: Number(formatEther(a.cost ?? a.proceeds)), tx: l.transactionHash, li: l.logIndex });
    }
  }
  fills.sort((x, y) => x.b - y.b || x.li - y.li);
  const seen = new Set();
  const uniq = fills.filter((f) => { const k = f.tx + ":" + f.li; if (seen.has(k)) return false; seen.add(k); return true; });
  return { market: MARKET, chainId: CHAIN_ID, fromBlock: Number(MARKET_FROM), toBlock: Number(latest), updatedAt: new Date().toISOString(), fills: uniq };
}

export async function readVault(address) {
  const s = await pub.readContract({ address, abi: vaultAbi, functionName: "summary" });
  const n = Number(s[6]);
  const recs = [];
  for (let i = 0; i < n; i += 200) recs.push(...(await pub.readContract({ address, abi: vaultAbi, functionName: "records", args: [BigInt(i), 200n] })));
  const [lastTradeAt, minTradeInterval, maxTradeTokens] = await Promise.all(["lastTradeAt", "minTradeInterval", "maxTradeTokens"].map((f) => pub.readContract({ address, abi: vaultAbi, functionName: f })));
  return { nav: s[0], sei: s[1], tok: Number(s[2]), shares: s[3], pps: s[4], price: s[5], keeper: s[7], paused: s[8], recs, lastTradeAt: Number(lastTradeAt), minTradeInterval: Number(minTradeInterval), maxTradeTokens: Number(maxTradeTokens) };
}
