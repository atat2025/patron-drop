import { createPublicClient, createWalletClient, custom, defineChain, http, parseAbi, type Address, type EIP1193Provider } from "viem";
import type { ChainCfg, PlanCfg } from "./chains";

const abi = parseAbi([
  "function summary() view returns (uint256 navOut, uint256 sei, uint256 usdcBal, uint256 patBal, uint256 totalShares, uint256 pps, uint256 seiPerUsdc, uint256 patPriceSei, uint256 nRecs, address keeper, bool paused)",
  "struct Rec { uint32 time; uint8 kind; uint64 ppsNano; uint128 navBase; }",
  "function records(uint256 from, uint256 n) view returns (Rec[])",
  "function sharesOf(address) view returns (uint256)", "function valueOf(address) view returns (uint256)", "function feeBps() view returns (uint256)",
  "function deposit(uint256 amount) payable returns (uint256)", "function withdraw(uint256 shares)",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const chainOf = (c: ChainCfg) => defineChain({ id: c.chainId, name: c.name, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: { default: { http: [c.rpc] } }, blockExplorers: { default: { name: "Explorer", url: c.explorer } } });
const pubs: Record<string, ReturnType<typeof createPublicClient>> = {};
const pub = (c: ChainCfg) => (pubs[c.key] ||= createPublicClient({ chain: chainOf(c), transport: http() }));

export interface PlanView { cfg: PlanCfg; nav: bigint; sei: bigint; usdc: bigint; pat: bigint; shares: bigint; pps: number; usdPerSei: number; patSei: number; fee: number; paused: boolean; hist: { t: number; pps: number }[]; mine: bigint; mineValue: bigint; wallet: bigint }

export async function readPlan(c: ChainCfg, p: PlanCfg, user?: Address | null): Promise<PlanView> {
  const cl = pub(c);
  const [s, fee] = await Promise.all([cl.readContract({ address: p.address, abi, functionName: "summary" }), cl.readContract({ address: p.address, abi, functionName: "feeBps" })]);
  const n = Number(s[8]);
  const recs = n ? await cl.readContract({ address: p.address, abi, functionName: "records", args: [BigInt(Math.max(0, n - 300)), 300n] }) : [];
  let mine = 0n, mineValue = 0n, wallet = 0n;
  if (user) {
    [mine, mineValue] = await Promise.all([cl.readContract({ address: p.address, abi, functionName: "sharesOf", args: [user] }), cl.readContract({ address: p.address, abi, functionName: "valueOf", args: [user] })]);
    wallet = p.token ? await cl.readContract({ address: p.token, abi: erc20, functionName: "balanceOf", args: [user] }) : await cl.getBalance({ address: user });
  }
  return { cfg: p, nav: s[0], sei: s[1], usdc: s[2], pat: s[3], shares: s[4], pps: Number(s[5]) / 1e18, usdPerSei: 1e18 / Number(s[6]), patSei: Number(s[7]) / 1e18, fee: Number(fee) / 100, paused: s[10],
    hist: recs.map((r) => ({ t: r.time, pps: Number(r.ppsNano) / 1e9 })), mine, mineValue, wallet };
}

/** "Put in $10 → about $X in a month", from the plan's own share-price history. null = not enough history. */
export function monthEstimate(h: { t: number; pps: number }[], nowPps: number): number | null {
  if (h.length < 2) return null;
  const span = Date.now() / 1000 - h[0].t;
  if (span < 7 * 86400 || !(h[0].pps > 0)) return null;
  return 10 * Math.pow(nowPps / h[0].pps, (30 * 86400) / span);
}

async function wallet(c: ChainCfg) {
  const e = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!e) throw new Error("No wallet found. Open this page in your wallet app's browser.");
  const [account] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
  const hex = ("0x" + c.chainId.toString(16)) as `0x${string}`;
  if (Number(await e.request({ method: "eth_chainId" })) !== c.chainId) {
    try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch { await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, nativeCurrency: { name: c.native, symbol: c.native, decimals: 18 }, rpcUrls: [c.rpc], blockExplorerUrls: [c.explorer] }] }); }
  }
  return createWalletClient({ account, chain: chainOf(c), transport: custom(e) });
}
export async function connect(c: ChainCfg) { return (await wallet(c)).account!.address; }
const wait = async (c: ChainCfg, hash: `0x${string}`) => { const r = await pub(c).waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("Transaction failed"); return hash; };

export async function putIn(c: ChainCfg, p: PlanCfg, amount: bigint) {
  const w = await wallet(c); const me = w.account!.address; const ch = chainOf(c);
  if (p.token) {
    const al = await pub(c).readContract({ address: p.token, abi: erc20, functionName: "allowance", args: [me, p.address] });
    if (al < amount) await wait(c, await w.writeContract({ address: p.token, abi: erc20, functionName: "approve", args: [p.address, amount], account: w.account!, chain: ch }));
    return wait(c, await w.writeContract({ address: p.address, abi, functionName: "deposit", args: [amount], account: w.account!, chain: ch }));
  }
  return wait(c, await w.writeContract({ address: p.address, abi, functionName: "deposit", args: [amount], value: amount, account: w.account!, chain: ch }));
}
export async function takeOut(c: ChainCfg, p: PlanCfg, shares: bigint) {
  const w = await wallet(c);
  return wait(c, await w.writeContract({ address: p.address, abi, functionName: "withdraw", args: [shares], account: w.account!, chain: chainOf(c) }));
}
