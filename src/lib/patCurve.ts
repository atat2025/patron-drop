import { createWalletClient, custom, parseAbi, type Address, type EIP1193Provider } from "viem";
import { pub, sei, connect, switchTo, BRIDGE } from "./bridge";
import { getEth, requireEth, canConnect } from "@/lib/wallet";

/** PatCurve on Sei mainnet: linear bonding curve selling bridged PAT (OFT) for SEI. */
export const CURVE = "0x88b1de8c7C04905f3c16bd67B6ED8a75075fC99B" as Address;
export const PAT_SEI = BRIDGE;
const abi = parseAbi([
  "function state() view returns (uint256 inv, uint256 soldAmt, uint256 backing, uint256 fees, uint256 price, bool isPaused)",
  "function quoteBuy(uint256) view returns (uint256 cost, uint256 fee)",
  "function quoteSell(uint256) view returns (uint256 gross, uint256 fee)",
  "function buy(uint256 amount, uint256 maxCost, uint256 deadline) payable",
  "function sell(uint256 amount, uint256 minReturn, uint256 deadline)",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const c = pub.sei;

const CACHE_KEY = "patron-patcurve-v1";
export type CurveSnap = { inv: string; sold: string; backing: string; price: string; paused: boolean; p0: number; slope: number; t: number };
/** Known mainnet PatCurve params (updated by live reads). Lets first paint show a real rising curve with zero RPC. */
const BAKED: CurveSnap = {
  inv: "19390000000000000000000", sold: "100000000000000000000", backing: "0",
  price: "185646400000000000", paused: false, p0: 0.1856, slope: 4.64e-7, t: 0,
};
function readCache(): CurveSnap | null {
  if (typeof window === "undefined") return BAKED;
  try { const x = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return x?.price ? x as CurveSnap : BAKED; } catch { return BAKED; }
}
function writeCache(s: CurveSnap) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch {}
}
/** Last known curve snapshot (for instant first paint). */
export function cachedCurve(): { inv: bigint; sold: bigint; backing: bigint; price: bigint; paused: boolean; p0: number; slope: number } | null {
  const x = readCache();
  if (!x) return null;
  return { inv: BigInt(x.inv), sold: BigInt(x.sold), backing: BigInt(x.backing), price: BigInt(x.price), paused: !!x.paused, p0: x.p0, slope: x.slope };
}

export async function readCurve() {
  const [inv, sold, backing, , price, paused] = await c.readContract({ address: CURVE, abi, functionName: "state" });
  // refresh params cache alongside state when possible
  try {
    const cp = await curveParams(false);
    writeCache({ inv: inv.toString(), sold: sold.toString(), backing: backing.toString(), price: price.toString(), paused, p0: cp.p0, slope: cp.slope, t: Date.now() });
  } catch {
    const prev = readCache();
    writeCache({ inv: inv.toString(), sold: sold.toString(), backing: backing.toString(), price: price.toString(), paused, p0: prev?.p0 ?? 0, slope: prev?.slope ?? 0, t: Date.now() });
  }
  return { inv, sold, backing, price, paused };
}
export const quoteBuy = (a: bigint) => c.readContract({ address: CURVE, abi, functionName: "quoteBuy", args: [a] });
export const quoteSell = (a: bigint) => c.readContract({ address: CURVE, abi, functionName: "quoteSell", args: [a] });
export const patBalance = (a: Address) => c.readContract({ address: PAT_SEI, abi: erc20, functionName: "balanceOf", args: [a] });
async function w() {
  const e = getEth()!;
  const account = await connect(); await switchTo("sei");
  return createWalletClient({ account, chain: sei, transport: custom(e) });
}
const wait = async (hash: `0x${string}`) => { const r = await c.waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("Transaction reverted"); return hash; };
const dl = () => BigInt(Math.floor(Date.now() / 1000) + 600);
export async function buy(a: bigint) {
  const [cost, fee] = await quoteBuy(a); const max = ((cost + fee) * 101n) / 100n; const x = await w();
  return wait(await x.writeContract({ address: CURVE, abi, functionName: "buy", args: [a, max, dl()], value: max, account: x.account!, chain: sei }));
}
export async function sell(a: bigint) {
  const [g, fee] = await quoteSell(a); const min = ((g - fee) * 99n) / 100n; const x = await w(); const me = x.account!.address;
  if ((await c.readContract({ address: PAT_SEI, abi: erc20, functionName: "allowance", args: [me, CURVE] })) < a)
    await wait(await x.writeContract({ address: PAT_SEI, abi: erc20, functionName: "approve", args: [CURVE, a], account: x.account!, chain: sei }));
  return wait(await x.writeContract({ address: CURVE, abi, functionName: "sell", args: [a, min, dl()], account: x.account!, chain: sei }));
}

const pAbi = parseAbi(["function p0() view returns (uint256)", "function slope() view returns (uint256)",
  "event Bought(address indexed buyer, uint256 amount, uint256 cost, uint256 fee)", "event Sold(address indexed seller, uint256 amount, uint256 proceeds, uint256 fee)"]);
export const DEPLOY_BLOCK = 238894832n;

let _cp: { p0: number; slope: number } | null = null;
/** Price (SEI per PAT) after `s` whole PAT sold: p0 + slope * s.
 *  On-chain: price = p0 + slope * soldWei / 1e18, so slope_human = slope_raw / 1e18. */
export async function curveParams(useCache = true) {
  if (useCache && _cp) return _cp;
  if (useCache) {
    const snap = cachedCurve();
    if (snap && snap.slope > 0) { _cp = { p0: snap.p0, slope: snap.slope }; return _cp; }
  }
  const [p0, slope] = await Promise.all([c.readContract({ address: CURVE, abi: pAbi, functionName: "p0" }), c.readContract({ address: CURVE, abi: pAbi, functionName: "slope" })]);
  _cp = { p0: Number(p0) / 1e18, slope: Number(slope) / 1e18 };
  return _cp;
}

export type PatFill = { side: "BUY" | "SELL"; amount: number; price: number; tx: string; block: bigint };

const FILLS_KEY = "patron-patfills-v1";
function readFillsCache(): PatFill[] | null {
  if (typeof window === "undefined") return null;
  try {
    const x = JSON.parse(localStorage.getItem(FILLS_KEY) || "null");
    if (!Array.isArray(x?.fills)) return null;
    return x.fills.map((f: { side: "BUY" | "SELL"; amount: number; price: number; tx: string; block: string }) => ({ ...f, block: BigInt(f.block) }));
  } catch { return null; }
}
function writeFillsCache(fills: PatFill[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FILLS_KEY, JSON.stringify({ t: Date.now(), fills: fills.map((f) => ({ ...f, block: f.block.toString() })) }));
  } catch {}
}

/** Recent buys/sells. Short lookback + timeout so mobile / in-app browsers don't hang on Loading… */
export async function fills(): Promise<PatFill[]> {
  const cached = readFillsCache();
  const tip = await c.getBlockNumber();
  // ~2k blocks ≈ a few minutes on Sei; enough for recent dots without 40 RPC rounds
  const LOOKBACK = 8_000n;
  const from = tip - LOOKBACK > DEPLOY_BLOCK ? tip - LOOKBACK : DEPLOY_BLOCK;
  const ranges: [bigint, bigint][] = [];
  for (let b = from; b <= tip; b += 2000n) ranges.push([b, b + 1999n > tip ? tip : b + 1999n]);
  const out: PatFill[] = [];
  const deadline = Date.now() + 6_000;
  for (let i = 0; i < ranges.length; i += 4) {
    if (Date.now() > deadline) break;
    const res = await Promise.all(ranges.slice(i, i + 4).map(([a, b]) =>
      c.getLogs({ address: CURVE, events: pAbi.filter((x) => x.type === "event"), fromBlock: a, toBlock: b }).catch(() => [])));
    for (const logs of res) for (const l of logs as unknown as { eventName: string; args: { amount: bigint; cost?: bigint; proceeds?: bigint }; transactionHash: string; blockNumber: bigint }[]) {
      const amt = Number(l.args.amount) / 1e18; const sei = Number(l.eventName === "Bought" ? l.args.cost! : l.args.proceeds!) / 1e18;
      if (amt > 0) out.push({ side: l.eventName === "Bought" ? "BUY" : "SELL", amount: amt, price: sei / amt, tx: l.transactionHash, block: l.blockNumber });
    }
  }
  const sorted = out.sort((a, b) => Number(a.block - b.block));
  if (sorted.length) writeFillsCache(sorted);
  return sorted.length ? sorted : (cached || []);
}
