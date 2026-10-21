"use client";
import { useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, encodeFunctionData, erc20Abi, formatUnits, http, parseUnits, type Address } from "viem";
import { arbitrum } from "viem/chains";

// Hyperliquid official Bridge2 on Arbitrum + native USDC (Circle). Min 5 USDC; credited to the SENDER's HL account in ~1 min.
const BRIDGE = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7" as Address;
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address;
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const pub = createPublicClient({ chain: arbitrum, transport: http("https://arb1.arbitrum.io/rpc") });

export default function HlDeposit({ onClose }: { onClose: () => void }) {
  const [addr, setAddr] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint | null>(null);
  const [hl, setHl] = useState<string | null>(null);
  const [amt, setAmt] = useState("10");
  const [msg, setMsg] = useState<{ ok: boolean; t: string; tx?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const eth = () => (window as unknown as { ethereum?: Eth }).ethereum;

  const refresh = async (a: Address) => {
    setBal(await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [a] }).catch(() => null));
    const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "clearinghouseState", user: a }) }).then((x) => x.json()).catch(() => null);
    setHl(r?.marginSummary?.accountValue ?? null);
  };
  useEffect(() => { if (addr) refresh(addr); }, [addr]);

  const connect = async () => {
    const e = eth(); if (!e) return setMsg({ ok: false, t: "No wallet found. Open this page in MetaMask or another wallet app." });
    try { const [a] = (await e.request({ method: "eth_requestAccounts" })) as Address[]; setAddr(a); } catch (x) { setMsg({ ok: false, t: (x as Error).message.split("\n")[0] }); }
  };
  const deposit = async () => {
    const e = eth(); if (!e || !addr) return;
    const v = parseUnits(amt || "0", 6);
    if (v < parseUnits("5", 6)) return setMsg({ ok: false, t: "Minimum is 5 USDC. Smaller amounts are lost by the Hyperliquid bridge." });
    if (bal !== null && v > bal) return setMsg({ ok: false, t: "Not enough USDC on Arbitrum." });
    setBusy(true); setMsg(null);
    try {
      await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4b1" }] }).catch(async () => {
        await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0xa4b1", chainName: "Arbitrum One", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: ["https://arb1.arbitrum.io/rpc"], blockExplorerUrls: ["https://arbiscan.io"] }] });
      });
      const w = createWalletClient({ account: addr, chain: arbitrum, transport: custom(e) });
      const tx = await w.sendTransaction({ to: USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [BRIDGE, v] }) });
      setMsg({ ok: true, t: "Sent. Your Hyperliquid balance updates in about a minute.", tx });
      await pub.waitForTransactionReceipt({ hash: tx }).catch(() => {}); setTimeout(() => refresh(addr), 60_000);
    } catch (x) { setMsg({ ok: false, t: (x as Error).message.split("\n")[0] }); }
    setBusy(false);
  };
  const relay = `https://relay.link/bridge/hyperliquid${addr ? `?toAddress=${addr}` : ""}`;

  return (
    <div className="pt-modal" onClick={onClose}><div className="hl-dep" onClick={(e) => e.stopPropagation()}>
      <h3>Deposit to Hyperliquid</h3>
      {!addr ? <button className="pt-buy" onClick={connect}>Connect Wallet</button> : <>
        <dl className="pt-kv"><dt>Wallet</dt><dd>{addr.slice(0, 6)}…{addr.slice(-4)}</dd><dt>USDC on Arbitrum</dt><dd>{bal === null ? "—" : Number(formatUnits(bal, 6)).toFixed(2)}</dd><dt>Hyperliquid balance</dt><dd>{hl === null ? "—" : (+hl).toFixed(2)} USDC</dd></dl>
        <h4>1 · USDC on Arbitrum (fastest)</h4>
        <label className="pt-inp"><span>Amount</span><input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" /><em>USDC</em></label>
        <div className="pt-stops">{[10, 25, 50, 100].map((v) => <button key={v} onClick={() => setAmt(String(v))}>${v}</button>)}{bal !== null && <button onClick={() => setAmt(formatUnits(bal, 6))}>Max</button>}</div>
        <button className="pt-buy" disabled={busy} onClick={deposit}>{busy ? "Confirm in wallet…" : `Deposit ${amt || 0} USDC`}</button>
        <p className="ux-mut">Minimum 5 USDC. You sign one transaction on Arbitrum (small ETH gas). Funds go to the Hyperliquid account of this same wallet.</p>
      </>}
      <h4>2 · Any coin, any chain (ETH, BNB, SOL, USDT…)</h4>
      <a className="pt-sell hl-relay" href={relay} target="_blank" rel="noreferrer">Swap &amp; deposit with Relay →</a>
      <p className="ux-mut">Relay swaps your coin and delivers USDC straight to your Hyperliquid account{addr ? " (address pre-filled)" : ""}. Check the receiving address is your own wallet.</p>
      {msg && <p className={msg.ok ? "up" : "dn"}>{msg.t} {msg.tx && <a href={`https://arbiscan.io/tx/${msg.tx}`} target="_blank" rel="noreferrer">View tx</a>}</p>}
      <button className="ux-link" onClick={onClose}>Close</button>
    </div></div>
  );
}
