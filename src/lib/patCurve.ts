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
export async function readCurve() {
  const [inv, sold, backing, , price, paused] = await c.readContract({ address: CURVE, abi, functionName: "state" });
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
/** Price (SEI per PAT, as number) after `s` PAT sold. */
export async function curveParams() {
  const [p0, slope] = await Promise.all([c.readContract({ address: CURVE, abi: pAbi, functionName: "p0" }), c.readContract({ address: CURVE, abi: pAbi, functionName: "slope" })]);
  return { p0: Number(p0) / 1e18, slope: Number(slope) / 1e36 };
}
export type PatFill = { side: "BUY" | "SELL"; amount: number; price: number; tx: string; block: bigint };
/** Recent buys/sells (newest ~80k blocks, 2000-block chunks; RPC limit). */
export async function fills(): Promise<PatFill[]> {
  const tip = await c.getBlockNumber(); const from = tip - 80_000n > DEPLOY_BLOCK ? tip - 80_000n : DEPLOY_BLOCK;
  const ranges: [bigint, bigint][] = []; for (let b = from; b <= tip; b += 2000n) ranges.push([b, b + 1999n > tip ? tip : b + 1999n]);
  const out: PatFill[] = [];
  for (let i = 0; i < ranges.length; i += 8) {
    const res = await Promise.all(ranges.slice(i, i + 8).map(([a, b]) => c.getLogs({ address: CURVE, events: pAbi.filter((x) => x.type === "event"), fromBlock: a, toBlock: b }).catch(() => [])));
    for (const logs of res) for (const l of logs as unknown as { eventName: string; args: { amount: bigint; cost?: bigint; proceeds?: bigint }; transactionHash: string; blockNumber: bigint }[]) {
      const amt = Number(l.args.amount) / 1e18; const sei = Number(l.eventName === "Bought" ? l.args.cost! : l.args.proceeds!) / 1e18;
      if (amt > 0) out.push({ side: l.eventName === "Bought" ? "BUY" : "SELL", amount: amt, price: sei / amt, tx: l.transactionHash, block: l.blockNumber });
    }
  }
  return out.sort((a, b) => Number(a.block - b.block));
}
