"use client";
import { parseAbiItem, formatEther, type Address } from "viem";
import { pub } from "./patronChain";

const FROM = BigInt(process.env.NEXT_PUBLIC_PATRON_LAUNCH_BLOCK || "0");
const bought = parseAbiItem("event Bought(address indexed buyer, uint256 amount, uint256 cost, uint256 fee)");
const sold = parseAbiItem("event Sold(address indexed seller, uint256 amount, uint256 proceeds, uint256 fee)");
export type Fill = { side: "BUY" | "SELL"; amount: number; sei: number; price: number; block: bigint; tx: string; who: string };

/** Curve trades from on-chain Bought/Sold events (2000-block RPC windows, parallel). */
export async function loadFills(addr: string, from: bigint = FROM, tokenDec = 18): Promise<Fill[]> {
  if (!addr || !from) return [];
  const latest = await pub.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let b = from; b <= latest && ranges.length < 400; b += 2000n) ranges.push([b, b + 1999n > latest ? latest : b + 1999n]);
  const out: Fill[] = [];
  for (let i = 0; i < ranges.length; i += 12) {
    const res = await Promise.all(ranges.slice(i, i + 12).map(([f, t]) =>
      pub.getLogs({ address: addr as Address, events: [bought, sold], fromBlock: f, toBlock: t }).catch(() => [])));
    for (const logs of res) for (const l of logs) {
      const a = l.args as { amount: bigint; cost?: bigint; proceeds?: bigint; buyer?: string; seller?: string };
      const amount = tokenDec ? Number(formatEther(a.amount)) : Number(a.amount), sei = Number(formatEther(a.cost ?? a.proceeds ?? 0n));
      out.push({ side: l.eventName === "Bought" ? "BUY" : "SELL", amount, sei, price: amount ? sei / amount : 0, block: l.blockNumber!, tx: l.transactionHash!, who: (a.buyer ?? a.seller ?? "") });
    }
  }
  return out.sort((x, y) => Number(x.block - y.block));
}

