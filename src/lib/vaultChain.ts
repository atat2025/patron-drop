"use client";
import { createPublicClient, createWalletClient, custom, http, parseAbi, defineChain, type Address, type EIP1193Provider } from "viem";

/** Network switch: NEXT_PUBLIC_VAULT_NETWORK = testnet (default, Sei 1328) | mainnet (Sei 1329).
 *  Mainnet needs NEXT_PUBLIC_VAULT_ADDRESS + NEXT_PUBLIC_VAULT_TOKEN (PatronOFT on Sei) and is OFF until set. */
export const NET = process.env.NEXT_PUBLIC_VAULT_NETWORK === "mainnet" ? "mainnet" : "testnet";
const T = {
  testnet: { id: 1328, name: "Sei Testnet", rpc: "https://evm-rpc-testnet.sei-apis.com", explorer: "atlantic-2",
    vault: "0x2Bc12FE8125df1E3116c818ddf223fB92241B664", token: "0x8f6E5ae94F1aF5Ac4C8D9A98d6fA6789692c26d2", launch: "0x1F96758D4024104991f3068Fb5d12D329Aea2C7d" },
  mainnet: { id: 1329, name: "Sei", rpc: "https://evm-rpc.sei-apis.com", explorer: "pacific-1", vault: "", token: "", launch: "" },
}[NET];
export const CHAIN = defineChain({ id: T.id, name: T.name, nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_VAULT_RPC_URL || T.rpc] } } });
export const VAULT = (process.env.NEXT_PUBLIC_VAULT_ADDRESS || T.vault) as Address;
export const TOKEN = (process.env.NEXT_PUBLIC_VAULT_TOKEN || T.token) as Address;
export const LAUNCH = (process.env.NEXT_PUBLIC_PATRON_LAUNCH || T.launch) as Address;
export const enabled = Boolean(VAULT && TOKEN);
export const isTestnet = NET === "testnet";
export const tx = (h: string) => `https://seitrace.com/tx/${h}?chain=${T.explorer}`;
export const addr = (a: string) => `https://seitrace.com/address/${a}?chain=${T.explorer}`;

export const vaultAbi = parseAbi([
  "function totalDeposits() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function strategyBalance(address,uint256) view returns (uint256)",
  "function strategyTotal(uint256) view returns (uint256)",
  "function deposit(uint256 amount, uint256 strategyId)",
  "function withdraw(uint256 amount, uint256 strategyId)",
]);
const erc = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const launchAbi = parseAbi(["function quoteBuy(uint256) view returns (uint256 cost, uint256 fee)", "function buy(uint256 amount, uint256 maxCost, uint256 deadline) payable"]);

export const pub = createPublicClient({ chain: CHAIN, transport: http() });
const eth = () => (window as unknown as { ethereum?: EIP1193Provider }).ethereum;

export async function connect(): Promise<Address> {
  const e = eth(); if (!e) throw new Error("No wallet found (install MetaMask or similar)");
  const [a] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
  if (Number(await e.request({ method: "eth_chainId" })) !== CHAIN.id) {
    const hex = "0x" + CHAIN.id.toString(16);
    try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
    catch { await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: CHAIN.rpcUrls.default.http, blockExplorerUrls: ["https://seitrace.com"] }] }); }
  }
  return a;
}
async function wallet() { const a = await connect(); return createWalletClient({ account: a, chain: CHAIN, transport: custom(eth()!) }); }
async function wait(h: `0x${string}`) { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("Transaction reverted"); return h; }

export async function readVault(user?: Address | null, ids: number[] = []) {
  const [tvl, wallet, mine, per, allow] = await Promise.all([
    pub.readContract({ address: VAULT, abi: vaultAbi, functionName: "totalDeposits" }),
    user ? pub.readContract({ address: TOKEN, abi: erc, functionName: "balanceOf", args: [user] }) : 0n,
    user ? pub.readContract({ address: VAULT, abi: vaultAbi, functionName: "balanceOf", args: [user] }) : 0n,
    user ? Promise.all(ids.map((i) => pub.readContract({ address: VAULT, abi: vaultAbi, functionName: "strategyBalance", args: [user, BigInt(i)] }))) : ids.map(() => 0n),
    user ? pub.readContract({ address: TOKEN, abi: erc, functionName: "allowance", args: [user, VAULT] }) : 0n,
  ]);
  return { tvl, wallet, mine, per, allow };
}
export async function approve(amount: bigint) { const w = await wallet(); return wait(await w.writeContract({ address: TOKEN, abi: erc, functionName: "approve", args: [VAULT, amount], account: w.account!, chain: CHAIN, gas: 500_000n })); }
export async function deposit(amount: bigint, sid: number) { const w = await wallet(); return wait(await w.writeContract({ address: VAULT, abi: vaultAbi, functionName: "deposit", args: [amount, BigInt(sid)], account: w.account!, chain: CHAIN, gas: 1_500_000n })); }
export async function withdraw(amount: bigint, sid: number) { const w = await wallet(); return wait(await w.writeContract({ address: VAULT, abi: vaultAbi, functionName: "withdraw", args: [amount, BigInt(sid)], account: w.account!, chain: CHAIN, gas: 1_500_000n })); }
/** Testnet only: buy rehearsal PAT on the PatronLaunch curve (1% slippage). */
export async function buyPat(amount: bigint) {
  if (!isTestnet || !LAUNCH) throw new Error("Curve buy is testnet only");
  const [c, f] = await pub.readContract({ address: LAUNCH, abi: launchAbi, functionName: "quoteBuy", args: [amount] });
  const max = ((c + f) * 10_100n) / 10_000n; const w = await wallet();
  return wait(await w.writeContract({ address: LAUNCH, abi: launchAbi, functionName: "buy", args: [amount, max, BigInt(Math.floor(Date.now() / 1000) + 300)], value: max, account: w.account!, chain: CHAIN, gas: 1_500_000n }));
}
