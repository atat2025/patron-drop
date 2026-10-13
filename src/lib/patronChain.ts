"use client";
import { createPublicClient, createWalletClient, custom, http, parseAbi, type EIP1193Provider, type Address } from "viem";
import { seiTestnet } from "viem/chains";

/** PATRON drop on Sei EVM TESTNET (atlantic-2, chain 1328). No mainnet. */
export const PATRON_CHAIN = {
  ...seiTestnet,
  id: 1328,
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_PATRON_RPC_URL || "https://evm-rpc-testnet.sei-apis.com"] } },
} as const;
export const EXPLORER = "https://seitrace.com";
export const explorerTx = (h: string) => `${EXPLORER}/tx/${h}?chain=atlantic-2`;
export const explorerAddr = (a: string) => `${EXPLORER}/address/${a}?chain=atlantic-2`;

export const MARKET = (process.env.NEXT_PUBLIC_PATRON_MARKET || "0xB4Bf3BbA6BD96D8C1736940c75d85E4EA4b02039") as Address | "";
export const TOKEN = (process.env.NEXT_PUBLIC_PATRON_TOKEN || "0x322d1A62ca7505827baedC726949168Ff06b106f") as Address | "";
export const chainEnabled = Boolean(MARKET && TOKEN);

export const marketAbi = parseAbi([
  "function state() view returns (uint256 reserve, uint256 supply, uint256 redeemed, uint256 nextPrice, uint256 backing, uint256 fees)",
  "function quoteBuy(uint256 amount) view returns (uint256 cost, uint256 fee)",
  "function quoteSell(uint256 amount) view returns (uint256 gross, uint256 fee)",
  "function virtualSei() view returns (uint256)",
  "function buy(uint256 amount, uint256 maxCost) payable",
  "function sell(uint256 amount, uint256 minReturn)",
]);
export const tokenAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function redeem(uint256 amount)",
]);

export const pub = createPublicClient({ chain: PATRON_CHAIN, transport: http() });

export interface ChainState { reserve: number; supply: number; redeemed: number; nextPrice: bigint; virtualSei: bigint }
export async function readState(): Promise<ChainState> {
  const m = MARKET as Address;
  const [s, v] = await Promise.all([
    pub.readContract({ address: m, abi: marketAbi, functionName: "state" }),
    pub.readContract({ address: m, abi: marketAbi, functionName: "virtualSei" }),
  ]);
  return { reserve: Number(s[0]), supply: Number(s[1]), redeemed: Number(s[2]), nextPrice: s[3], virtualSei: v };
}
export const readBalance = (a: Address) => pub.readContract({ address: TOKEN as Address, abi: tokenAbi, functionName: "balanceOf", args: [a] }).then(Number);
export const quoteBuy = (n: number) => pub.readContract({ address: MARKET as Address, abi: marketAbi, functionName: "quoteBuy", args: [BigInt(n)] });
export const quoteSell = (n: number) => pub.readContract({ address: MARKET as Address, abi: marketAbi, functionName: "quoteSell", args: [BigInt(n)] });

const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum : undefined);
export const hasWallet = () => Boolean(eth());

export async function addSeiTestnet() {
  const e = eth(); if (!e) throw new Error("No wallet found");
  const hex = "0x" + PATRON_CHAIN.id.toString(16);
  try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
  catch {
    await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: "Sei Testnet (atlantic-2)", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: ["https://evm-rpc-testnet.sei-apis.com"], blockExplorerUrls: ["https://seitrace.com/?chain=atlantic-2"] }] });
  }
}

async function wallet() {
  const e = eth(); if (!e) throw new Error("No wallet found");
  const [account] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
  const id = Number(await e.request({ method: "eth_chainId" }));
  if (id !== PATRON_CHAIN.id) await addSeiTestnet();
  return createWalletClient({ account, chain: PATRON_CHAIN, transport: custom(e) });
}

const SLIP = 100n; // 1% slippage tolerance (bps*100 scale below)
async function send(fn: (w: Awaited<ReturnType<typeof wallet>>) => Promise<`0x${string}`>) {
  const w = await wallet();
  const hash = await fn(w);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("Transaction reverted");
  return hash;
}
export async function buy(n: number) {
  const [c, f] = await quoteBuy(n); const total = c + f; const max = total + (total * SLIP) / 10_000n;
  return send((w) => w.writeContract({ address: MARKET as Address, abi: marketAbi, functionName: "buy", args: [BigInt(n), max], value: max, account: w.account!, chain: PATRON_CHAIN }));
}
export async function sell(n: number) {
  const [g, f] = await quoteSell(n); const min = ((g - f) * (10_000n - SLIP)) / 10_000n;
  const w = await wallet(); const me = w.account!.address;
  const al = await pub.readContract({ address: TOKEN as Address, abi: tokenAbi, functionName: "allowance", args: [me, MARKET as Address] });
  if (al < BigInt(n)) await send((w) => w.writeContract({ address: TOKEN as Address, abi: tokenAbi, functionName: "approve", args: [MARKET as Address, BigInt(n)], account: w.account!, chain: PATRON_CHAIN }));
  return send((w) => w.writeContract({ address: MARKET as Address, abi: marketAbi, functionName: "sell", args: [BigInt(n), min], account: w.account!, chain: PATRON_CHAIN }));
}
export const redeem = (n: number) => send((w) => w.writeContract({ address: TOKEN as Address, abi: tokenAbi, functionName: "redeem", args: [BigInt(n)], account: w.account!, chain: PATRON_CHAIN }));

/** Plain injected-wallet connect (no exchange SDK). */
export async function connect(): Promise<string> {
  const e = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!e) throw new Error("No wallet found (install MetaMask or similar)");
  const [a] = (await e.request({ method: "eth_requestAccounts" })) as string[];
  return a;
}
