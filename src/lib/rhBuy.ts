import { encodeAbiParameters, encodeFunctionData, encodePacked, parseAbi, type Address } from "viem";
import { pub } from "@/lib/bridge";

/** Robinhood Chain (4663) PAT buy: ETH -> WETH -> NVDA (Uniswap v3 0.05%) -> PAT (Uniswap v4 PAT/NVDA 0.25%), one Universal Router tx. */
export const PAT = "0x44CF4cA3D50B2EE4fB614C7B27f7e5fB72baeaf3" as Address;
export const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC" as Address;
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;
export const UR = "0x204FAca1764B154221e35c0d20aBb3c525710498" as Address;
const STATEVIEW = "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b" as Address;
const QUOTER_V4 = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as Address;
const QUOTER_V3 = "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as Address;
const V3_POOL = "0x62ab521f71431f78ac374cdbadc6cda3c8916b6c" as Address; // WETH/NVDA 0.05% (token0 = WETH)
export const POOL_ID = "0x304f7d55dfe31d218702191c23d4e753f3e2531ec4fdc66ff9c529628ef0c134" as const;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const KEY = [PAT, NVDA, 2500, 25, ZERO] as const; // currency0 = PAT, currency1 = NVDA
const CONTRACT_BALANCE = 1n << 255n;
const ROUTER_SELF = "0x0000000000000000000000000000000000000002" as Address;
export const SLIPPAGE_BPS = 300n; // 3%
const rh = pub.rh;

/** On-chain spot: PAT per ETH and NVDA per ETH. */
export async function readSpot() {
  const [s0, v3] = await Promise.all([
    rh.readContract({ address: STATEVIEW, abi: parseAbi(["function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)"]), functionName: "getSlot0", args: [POOL_ID] }),
    rh.readContract({ address: V3_POOL, abi: parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"]), functionName: "slot0" }),
  ]);
  const nvdaPerPat = Number(s0[0]) ** 2 / 2 ** 192;
  const nvdaPerEth = Number(v3[0]) ** 2 / 2 ** 192;
  return { nvdaPerPat, nvdaPerEth, ethPerPat: nvdaPerPat / nvdaPerEth };
}

/** Quote: ETH in -> NVDA -> PAT out. */
export async function quote(ethIn: bigint) {
  const q3 = await rh.simulateContract({ address: QUOTER_V3, abi: parseAbi(["function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)"]), functionName: "quoteExactInputSingle", args: [[WETH, NVDA, ethIn, 500, 0n]] });
  const nvda = q3.result[0];
  const q4 = await rh.simulateContract({ address: QUOTER_V4, abi: parseAbi(["function quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256,uint256)"]), functionName: "quoteExactInputSingle", args: [[KEY, false, nvda, "0x"]] });
  return { nvda, pat: q4.result[0] };
}

const minOf = (v: bigint) => (v * (10000n - SLIPPAGE_BPS)) / 10000n;

/** Universal Router execute(): WRAP_ETH -> V3_SWAP_EXACT_IN (WETH->NVDA, kept in router) -> V4_SWAP [SETTLE NVDA, SWAP_EXACT_IN_SINGLE, TAKE_ALL PAT to buyer]. */
export function buildBuy(q: { nvda: bigint; pat: bigint }, deadline: bigint) {
  const wrap = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [ROUTER_SELF, CONTRACT_BALANCE]);
  const path = encodePacked(["address", "uint24", "address"], [WETH, 500, NVDA]);
  const v3 = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }, { type: "bool" }], [ROUTER_SELF, CONTRACT_BALANCE, minOf(q.nvda), path, false]);
  const KT = { type: "tuple", components: [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }] } as const;
  const minPat = minOf(q.pat);
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], [NVDA, CONTRACT_BALANCE, false]);
  const swap = encodeAbiParameters([{ type: "tuple", components: [KT, { type: "bool" }, { type: "uint128" }, { type: "uint128" }, { type: "uint256" }, { type: "bytes" }] }], [[KEY, false, 0n, minPat, 0n, "0x"]]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [PAT, minPat]);
  const v4 = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], ["0x0b060f", [settle, swap, take]]);
  return { data: encodeFunctionData({ abi: parseAbi(["function execute(bytes,bytes[],uint256) payable"]), functionName: "execute", args: ["0x0b0010", [wrap, v3, v4], deadline] }), minPat };
}

export const patBalance = (a: Address) => rh.readContract({ address: PAT, abi: parseAbi(["function balanceOf(address) view returns (uint256)"]), functionName: "balanceOf", args: [a] });
export const ethBalance = (a: Address) => rh.getBalance({ address: a });

/** ETH/USD for display only (CoinGecko, falls back to the pool's public price on GeckoTerminal). */
export async function ethUsd(): Promise<number> {
  try { const j = await (await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")).json(); const v = Number(j?.ethereum?.usd); if (v > 0) return v; } catch {}
  try { const j = await (await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot")).json(); const v = Number(j?.data?.amount); if (v > 0) return v; } catch {}
  return 0;
}
