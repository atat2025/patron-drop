"use client";
import { parseAbiItem, formatEther, type Address } from "viem";
import { pub } from "./patronChain";
import { NET } from "./network";

const FROM = BigInt(process.env.NEXT_PUBLIC_PATRON_LAUNCH_BLOCK || "0");
const bought = parseAbiItem("event Bought(address indexed buyer, uint256 amount, uint256 cost, uint256 fee)");
const sold = parseAbiItem("event Sold(address indexed seller, uint256 amount, uint256 proceeds, uint256 fee)");
export type Fill = { side: "BUY" | "SELL"; amount: number; sei: number; price: number; block: bigint; tx: string; who: string };

const WIN = 2000n; // Sei RPC getLogs limit
async function scan(addr: Address, from: bigint, to: bigint, tokenDec: number, maxWindows = 400): Promise<Fill[]> {
  const ranges: [bigint, bigint][] = [];
  // newest first so a cap never drops the most recent trades
  for (let t = to; t >= from && ranges.length < maxWindows; t -= WIN) ranges.push([t - WIN + 1n < from ? from : t - WIN + 1n, t]);
  const out: Fill[] = [];
  const get = async (f: bigint, t: bigint) => { // retry: the public RPC rate-limits bursts, a silent miss would hide recent trades
    for (let k = 0; k < 4; k++) { try { return await pub.getLogs({ address: addr, events: [bought, sold], fromBlock: f, toBlock: t }); } catch { await new Promise((r) => setTimeout(r, 400 * (k + 1))); } }
    return [];
  };
  for (let i = 0; i < ranges.length; i += 6) {
    const res = await Promise.all(ranges.slice(i, i + 6).map(([f, t]) => get(f, t)));
    for (const logs of res) for (const l of logs) {
      const a = l.args as { amount: bigint; cost?: bigint; proceeds?: bigint; buyer?: string; seller?: string };
      const amount = tokenDec ? Number(formatEther(a.amount)) : Number(a.amount), sei = Number(formatEther(a.cost ?? a.proceeds ?? 0n));
      out.push({ side: l.eventName === "Bought" ? "BUY" : "SELL", amount, sei, price: amount ? sei / amount : 0, block: l.blockNumber!, tx: l.transactionHash!, who: a.buyer ?? a.seller ?? "" });
    }
  }
  return out;
}

/** Curve trades from on-chain Bought/Sold events (2000-block RPC windows, parallel). Used by the rehearsal launch. */
export async function loadFills(addr: string, from: bigint = FROM, tokenDec = 18): Promise<Fill[]> {
  if (!addr || !from) return [];
  const latest = await pub.getBlockNumber();
  return (await scan(addr as Address, from, latest, tokenDec)).sort((x, y) => Number(x.block - y.block));
}

type Snap = { toBlock: number; fills: { b: number; side: "BUY" | "SELL"; amount: number; sei: number; tx: string }[] };
/** PATRON Edition 0 market trades: indexed history (keeper job, refreshed on a schedule) + live tail read from the chain. */
export async function loadMarketFills(addr: string): Promise<Fill[]> {
  if (!addr) return [];
  const latest = await pub.getBlockNumber();
  let snap: Snap | null = null;
  if (NET.dataUrl) snap = await fetch(`${NET.dataUrl}/market-fills.json?t=${Math.floor(Date.now() / 60000)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const hist: Fill[] = (snap?.fills || []).map((f) => ({ side: f.side, amount: f.amount, sei: f.sei, price: f.amount ? f.sei / f.amount : 0, block: BigInt(f.b), tx: f.tx, who: "" }));
  const from = snap ? BigInt(snap.toBlock) + 1n : NET.marketFromBlock;
  const tail = from <= latest ? await scan(addr as Address, from, latest, 0, 60) : [];
  const seen = new Set(hist.map((f) => f.tx));
  return [...hist, ...tail.filter((f) => !seen.has(f.tx))].sort((x, y) => Number(x.block - y.block));
}
