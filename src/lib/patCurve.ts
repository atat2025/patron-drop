import { createWalletClient, custom, parseAbi, type Address, type EIP1193Provider } from "viem";
import { pub, sei, connect, switchTo, BRIDGE } from "./bridge";

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
  const e = (window as unknown as { ethereum?: EIP1193Provider }).ethereum!;
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
