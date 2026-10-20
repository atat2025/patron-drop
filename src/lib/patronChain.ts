"use client";
import { createPublicClient, createWalletClient, custom, http, parseAbi, type EIP1193Provider, type Address } from "viem";
import { defineChain } from "viem";
import { NET, explorerTx, explorerAddr, seiscanTx } from "./network";
export { NET, explorerTx, explorerAddr, seiscanTx };

/** PATRON drop chain, chosen by NEXT_PUBLIC_PATRON_NETWORK (see lib/network.ts). Default: Sei TESTNET 1328. */
export const PATRON_CHAIN = defineChain({
  id: NET.chainId, name: NET.chainName,
  nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 },
  rpcUrls: { default: { http: [NET.rpc] } },
  blockExplorers: { default: { name: "Seitrace", url: NET.explorer } },
});

export const MARKET = NET.market as Address | "";
export const TOKEN = NET.token as Address | "";
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
  const e = eth(); if (!e) throw new Error("No wallet found (install MetaMask or similar)");
  const hex = "0x" + PATRON_CHAIN.id.toString(16);
  try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
  catch {
    await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: NET.chainName, nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: [NET.rpc], blockExplorerUrls: [`${NET.explorer}/?chain=${NET.explorerChain}`] }] });
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
  if (al < BigInt(n)) await send((w) => w.writeContract({ address: TOKEN as Address, abi: tokenAbi, functionName: "approve", args: [MARKET as Address, 2n ** 256n - 1n], account: w.account!, chain: PATRON_CHAIN }));
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

/* ---------- Pay with USDC in ONE transaction (EIP-2612 permit + PatronRouter). TESTNET. ---------- */
export const USDC_ROUTES = {
  USDC: { token: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED" as Address, router: (process.env.NEXT_PUBLIC_ROUTER_USDC || "0x8d76eb17Bbc2b95594141D9C06229ac8656FA94A") as Address, label: "USDC (Circle testnet)" },
  mUSDC: { token: "0x15828F985E1d5A47d663b2AB635158a3fbbC035C" as Address, router: (process.env.NEXT_PUBLIC_ROUTER_MUSDC || "0xcFC9a7b57c1Ad3d4d7c3c974A98064AA17941768") as Address, label: "mUSDC (test faucet)" },
} as const;
export type UsdcKind = keyof typeof USDC_ROUTES;
const routerAbi = parseAbi([
  "function quote(uint256 amount) view returns (uint256 usdcIn, uint256 seiIn)",
  "function buyWithPermit(uint256 amount, uint256 maxUsdc, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function buy(uint256 amount, uint256 maxUsdc)",
]);
const permitAbi = parseAbi([
  "function name() view returns (string)", "function version() view returns (string)",
  "function nonces(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)", "function faucet(uint256)",
]);
export const quoteUsdc = (k: UsdcKind, n: number) => pub.readContract({ address: USDC_ROUTES[k].router, abi: routerAbi, functionName: "quote", args: [BigInt(n)] });
export const usdcBalance = (k: UsdcKind, a: Address) => pub.readContract({ address: USDC_ROUTES[k].token, abi: permitAbi, functionName: "balanceOf", args: [a] });
export const mintTestUsdc = () => send((w) => w.writeContract({ address: USDC_ROUTES.mUSDC.token, abi: permitAbi, functionName: "faucet", args: [100_000_000n], account: w.account!, chain: PATRON_CHAIN }));
/** 1 off-chain signature (permit, free) + 1 tx. If allowance already covers it: just the tx. Never an approve tx. */
export async function buyUsdc(k: UsdcKind, n: number) {
  const { token, router } = USDC_ROUTES[k];
  const [q] = await quoteUsdc(k, n); const max = q + q / 100n + 1n;
  const w = await wallet(); const me = w.account!.address;
  const al = await pub.readContract({ address: token, abi: permitAbi, functionName: "allowance", args: [me, router] });
  if (al >= max) return send((w) => w.writeContract({ address: router, abi: routerAbi, functionName: "buy", args: [BigInt(n), max], account: w.account!, chain: PATRON_CHAIN }));
  const [name, version, nonce] = await Promise.all([
    pub.readContract({ address: token, abi: permitAbi, functionName: "name" }),
    pub.readContract({ address: token, abi: permitAbi, functionName: "version" }).catch(() => "1"),
    pub.readContract({ address: token, abi: permitAbi, functionName: "nonces", args: [me] }),
  ]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  const sig = await w.signTypedData({
    account: w.account!, domain: { name, version, chainId: PATRON_CHAIN.id, verifyingContract: token },
    types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] },
    primaryType: "Permit", message: { owner: me, spender: router, value: max, nonce, deadline },
  });
  const r = ("0x" + sig.slice(2, 66)) as `0x${string}`, s = ("0x" + sig.slice(66, 130)) as `0x${string}`; let v = parseInt(sig.slice(130, 132), 16); if (v < 27) v += 27;
  return send((w) => w.writeContract({ address: router, abi: routerAbi, functionName: "buyWithPermit", args: [BigInt(n), max, deadline, v, r, s], account: w.account!, chain: PATRON_CHAIN }));
}
/** Optional: show PATRON in the wallet (one prompt, no address copy-paste). */
export const watchPatron = () => eth()?.request({ method: "wallet_watchAsset", params: { type: "ERC20", options: { address: TOKEN as Address, symbol: "PATRON", decimals: 0 } } } as never);
