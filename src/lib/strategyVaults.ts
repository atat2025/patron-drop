"use client";
import { createWalletClient, custom, parseAbi, type Address, type EIP1193Provider } from "viem";
import { pub, PATRON_CHAIN, addSeiTestnet } from "./patronChain";
import { NET } from "./network";

/** PatronStrategyVault x3 (one strategy each). Addresses come from lib/network.ts. */
export const META: Record<string, { name: string; agent: string; rule: string }> = {
  momentum: { name: "Night Owl Momentum", agent: "Agent A (fictional)", rule: "Buys when the price is above its recent average, sells when it falls below." },
  meanrev: { name: "Mean Revert Lite", agent: "Agent B (fictional)", rule: "Sells when the price is stretched above its average, buys back when it dips below." },
  dca: { name: "Steady Stack DCA", agent: "Agent C (fictional)", rule: "Buys 1 PATRON on a schedule while cash > 40%, takes profit above +3%." },
};
export const vaultAbi = parseAbi([
  "function summary() view returns (uint256 nav, uint256 seiBal, uint256 tokenBal, uint256 totalShares, uint256 pps, uint256 price, uint256 nRecs, address keeper, bool paused)",
  "struct Rec { uint32 time; uint8 kind; uint16 amount; uint64 navGwei; uint48 priceGwei; uint48 ppsNano; uint40 seiGwei; }",
  "function records(uint256 from, uint256 n) view returns (Rec[])",
  "function sharesOf(address) view returns (uint256)",
  "function valueOf(address) view returns (uint256)",
  "function deposit() payable returns (uint256)",
  "function withdraw(uint256 shares) returns (uint256)",
]);
export type Rec = { time: number; kind: number; amount: number; navGwei: bigint; priceGwei: bigint; ppsNano: bigint; seiGwei: bigint };
export interface VaultView { id: string; address: Address; nav: bigint; sei: bigint; tok: number; shares: bigint; pps: bigint; price: bigint; keeper: Address; paused: boolean; recs: Rec[]; mine: bigint; mineValue: bigint }

export async function readAll(user?: Address | null): Promise<VaultView[]> {
  return Promise.all(NET.vaults.map(async ({ id, address }) => {
    const a = address as Address;
    const s = await pub.readContract({ address: a, abi: vaultAbi, functionName: "summary" });
    const n = Number(s[6]);
    const recs: Rec[] = [];
    for (let i = 0; i < n; i += 200) recs.push(...((await pub.readContract({ address: a, abi: vaultAbi, functionName: "records", args: [BigInt(i), 200n] })) as unknown as Rec[]));
    const [mine, mineValue] = user ? await Promise.all([pub.readContract({ address: a, abi: vaultAbi, functionName: "sharesOf", args: [user] }), pub.readContract({ address: a, abi: vaultAbi, functionName: "valueOf", args: [user] })]) : [0n, 0n];
    return { id, address: a, nav: s[0], sei: s[1], tok: Number(s[2]), shares: s[3], pps: s[4], price: s[5], keeper: s[7], paused: s[8], recs, mine, mineValue };
  }));
}

export type KeeperEntry = { t: string; vault: string; price: number; nav: number; decision: string | null; amount: number; why: string; tx?: string; checkpoint?: boolean; error?: string; skipped?: string };
export async function readKeeperLog(): Promise<KeeperEntry[]> {
  if (!NET.dataUrl) return [];
  return fetch(`${NET.dataUrl}/keeper-log.json?t=${Math.floor(Date.now() / 60000)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
}

const eth = () => (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
export async function connect(): Promise<Address> {
  const e = eth(); if (!e) throw new Error("No wallet found (install MetaMask or similar)");
  const [a] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
  if (Number(await e.request({ method: "eth_chainId" })) !== PATRON_CHAIN.id) await addSeiTestnet();
  return a;
}
async function wallet() { const a = await connect(); return createWalletClient({ account: a, chain: PATRON_CHAIN, transport: custom(eth()!) }); }
async function wait(h: `0x${string}`) { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("Transaction reverted"); return h; }
export async function deposit(vault: Address, wei: bigint) { const w = await wallet(); return wait(await w.writeContract({ address: vault, abi: vaultAbi, functionName: "deposit", value: wei, account: w.account!, chain: PATRON_CHAIN })); }
export async function withdraw(vault: Address, shares: bigint) { const w = await wallet(); return wait(await w.writeContract({ address: vault, abi: vaultAbi, functionName: "withdraw", args: [shares], account: w.account!, chain: PATRON_CHAIN })); }
