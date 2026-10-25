import { createWalletClient, custom, encodeFunctionData, parseAbi, type Address, type EIP1193Provider } from "viem";
import { pub, sei, connect, switchTo } from "./bridge";
import { getEth, requireEth } from "@/lib/wallet";

/** Pay for PAT with a coin other than SEI: swap it to SEI on DragonSwap V2, then buy on PatCurve. */
export const ROUTER = "0x11DA6463D6Cb5a03411Dbf5ab6f6bc3997Ac7428" as Address; // DragonSwap V2 SwapRouter02 (WSEI-flavoured)
export const WSEI = "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7" as Address;
export const USDC = "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392" as Address;
const POOL = "0xcca2352200a63eb0Aaba2D40BA69b1d32174F285" as Address; // USDC/WSEI 0.3% (token0 = USDC)
export type Coin = { sym: "SEI" | "WSEI" | "USDC"; token?: Address; dec: number };
export const COINS: Coin[] = [{ sym: "SEI", dec: 18 }, { sym: "USDC", token: USDC, dec: 6 }, { sym: "WSEI", token: WSEI, dec: 18 }];

const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function withdraw(uint256)"]);
const poolAbi = parseAbi(["function slot0() view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool)"]);
const rAbi = parseAbi([
  "struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountOut; uint256 amountInMaximum; uint160 sqrtPriceLimitX96; }",
  "function exactOutputSingle(P params) payable returns (uint256)",
  "function unwrapWSEI(uint256 amountMinimum, address recipient) payable",
  "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])",
]);
const c = pub.sei;

export async function balances(me: Address) {
  const out: Record<string, bigint> = { SEI: await c.getBalance({ address: me }) };
  for (const k of COINS) if (k.token) out[k.sym] = await c.readContract({ address: k.token, abi: erc20, functionName: "balanceOf", args: [me] });
  return out;
}
/** USDC needed (max, incl. 3% price-move allowance) to receive `sei` SEI. */
export async function usdcFor(sei: bigint) {
  const [sp] = await c.readContract({ address: POOL, abi: poolAbi, functionName: "slot0" });
  const est = (sei << 192n) / (sp * sp); // WSEI-per-USDC = sp^2/2^192
  return { est: (est * 1003n) / 1000n, max: (est * 103n) / 100n };
}
async function w() {
  // Connect / WC first, THEN take the provider — never capture getEth() before session exists.
  const account = await connect();
  await switchTo("sei");
  const e = getEth() ?? await requireEth();
  return createWalletClient({ account, chain: sei, transport: custom(e) });
}
const wait = async (hash: `0x${string}`) => { const r = await c.waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("Transaction reverted"); return hash; };

/** Turn `coin` into exactly `sei` native SEI in the wallet. Returns tx hashes. USDC: approve (once) + 1 swap; WSEI: 1 unwrap. */
export async function getSei(coin: Coin, amt: bigint, step: (t: string) => void) {
  const x = await w(); const me = x.account!.address; const hs: string[] = [];
  if (coin.sym === "WSEI") { step("Turning WSEI into SEI…"); hs.push(await wait(await x.writeContract({ address: WSEI, abi: erc20, functionName: "withdraw", args: [amt], account: x.account!, chain: sei }))); return hs; }
  const { max } = await usdcFor(amt);
  if ((await c.readContract({ address: USDC, abi: erc20, functionName: "allowance", args: [me, ROUTER] })) < max) {
    step("Allow USDC to be swapped…");
    hs.push(await wait(await x.writeContract({ address: USDC, abi: erc20, functionName: "approve", args: [ROUTER, max], account: x.account!, chain: sei })));
  }
  step("Swapping USDC to SEI…");
  const data = [
    encodeFunctionData({ abi: rAbi, functionName: "exactOutputSingle", args: [{ tokenIn: USDC, tokenOut: WSEI, fee: 3000, recipient: "0x0000000000000000000000000000000000000002", amountOut: amt, amountInMaximum: max, sqrtPriceLimitX96: 0n }] }),
    encodeFunctionData({ abi: rAbi, functionName: "unwrapWSEI", args: [amt, me] }),
  ];
  hs.push(await wait(await x.writeContract({ address: ROUTER, abi: rAbi, functionName: "multicall", args: [BigInt(Math.floor(Date.now() / 1000) + 600), data], account: x.account!, chain: sei })));
  return hs;
}
