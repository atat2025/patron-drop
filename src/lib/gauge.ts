import { createWalletClient, custom, formatEther, parseAbi, type Address, type EIP1193Provider } from "viem";
import * as V from "./vaultChain";

/** GaugeConfig on Sei testnet (Sourcify verified). Owner-signed stages + operator manual amount with on-chain history. */
export const GAUGE = (process.env.NEXT_PUBLIC_GAUGE_CONFIG || "0x38d8C9808B838414d937384D90Dc337635E13D69") as Address;
/** SEI→JPY rate used to value PAT (PROVISIONAL). */
export const SEI_JPY = Number(process.env.NEXT_PUBLIC_SEI_JPY || "50");
const FALLBACK_STAGES = (process.env.NEXT_PUBLIC_GAUGE_STAGES || "300000000,500000000").split(",").map(Number);

export const gaugeAbi = parseAbi([
  "function owner() view returns (address)",
  "function config() view returns (uint256[], uint256, string, uint256)",
  "function historyLength() view returns (uint256)",
  "function historyAt(uint256) view returns ((uint8 kind, uint256 amountJPY, uint256[] stages, string note, uint256 at, address by))",
  "function setStages(uint256[] stages_)",
  "function setManualAmount(uint256 amountJPY, string note)",
]);
const launchAbi = parseAbi(["function state() view returns (uint256 reserve, uint256 sold, uint256 backing, uint256 fees, uint256 price, uint256 start, bool live, bool grad, bool capOn)"]);

export interface Change { kind: number; amountJPY: number; stages: number[]; note: string; at: number; by: string }
export interface GaugeData { stages: number[]; manualJPY: number; note: string; tvlPAT: number; patSEI: number; onchainJPY: number; history: Change[]; owner: string; live: boolean }

export async function readGauge(): Promise<GaugeData> {
  const p = V.pub;
  const [tvl, st] = await Promise.all([
    p.readContract({ address: V.VAULT, abi: V.vaultAbi, functionName: "totalDeposits" }) as Promise<bigint>,
    p.readContract({ address: V.LAUNCH, abi: launchAbi, functionName: "state" }).catch(() => null),
  ]);
  const tvlPAT = Number(formatEther(tvl));
  const patSEI = st ? Number(formatEther(st[4])) : 0;
  const onchainJPY = tvlPAT * patSEI * SEI_JPY;
  try {
    const [[stages, manual, note], owner, n] = await Promise.all([
      p.readContract({ address: GAUGE, abi: gaugeAbi, functionName: "config" }),
      p.readContract({ address: GAUGE, abi: gaugeAbi, functionName: "owner" }),
      p.readContract({ address: GAUGE, abi: gaugeAbi, functionName: "historyLength" }),
    ]);
    const idx = Array.from({ length: Math.min(Number(n), 30) }, (_, i) => Number(n) - 1 - i);
    const hist = await Promise.all(idx.map((i) => p.readContract({ address: GAUGE, abi: gaugeAbi, functionName: "historyAt", args: [BigInt(i)] })));
    return {
      stages: stages.map(Number), manualJPY: Number(manual), note, tvlPAT, patSEI, onchainJPY, owner, live: true,
      history: hist.map((h) => ({ kind: h.kind, amountJPY: Number(h.amountJPY), stages: h.stages.map(Number), note: h.note, at: Number(h.at) * 1000, by: h.by })),
    };
  } catch {
    return { stages: FALLBACK_STAGES, manualJPY: 0, note: "", tvlPAT, patSEI, onchainJPY, history: [], owner: "", live: false };
  }
}

export async function adminWrite(fn: "setStages" | "setManualAmount", args: readonly unknown[]) {
  const a = await V.connect();
  const w = createWalletClient({ account: a, chain: V.CHAIN, transport: custom((window as unknown as { ethereum: EIP1193Provider }).ethereum) });
  const h = await w.writeContract({ address: GAUGE, abi: gaugeAbi, functionName: fn, args: args as never, account: a, chain: V.CHAIN, gas: 3_000_000n });
  const r = await V.pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return h;
}
export const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
