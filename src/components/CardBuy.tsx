"use client";
import { useEffect, useRef, useState } from "react";
import { formatEther, type Address } from "viem";
import * as chain from "@/lib/patronChain";
import { CARD, isPlaceholderKey, transakUrl } from "@/lib/cardConfig";

type Step = "quote" | "pay" | "wait" | "confirm" | "buying" | "done";
const STEPS: [Step[], string][] = [[["quote"], "Quote"], [["pay", "wait"], "Pay (card / Apple Pay)"], [["confirm", "buying"], "Receive PATRON (approve in wallet)"], [["done"], "Done"]];
const f4 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CardBuy({ addr, connect, max, onDone }: { addr: string | null; connect: () => Promise<void> | void; max: number; onDone: () => void }) {
  const [step, setStep] = useState<Step>("quote");
  const [n, setN] = useState(1);
  const [cost, setCost] = useState<bigint | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bal, setBal] = useState<bigint>(0n);
  const [rcpt, setRcpt] = useState<{ hash: string; got: number; sei: number } | null>(null);
  const start = useRef<bigint>(0n);
  useEffect(() => { let on = true; chain.quoteBuy(n).then(([c, f]) => on && setCost(c + f)).catch(() => on && setCost(null)); return () => { on = false; }; }, [n]);

  const curveSei = cost == null ? null : Number(formatEther(cost + cost / 100n)); // +1% slippage cap
  const needSei = curveSei == null ? null : curveSei + CARD.gasBufferSei;
  const sub = needSei == null ? null : needSei * CARD.seiUsd;
  const raw = sub == null ? null : (sub + CARD.feeFixedUsd) / (1 - CARD.feePct / 100);
  const total = raw == null ? null : Math.max(CARD.minUsd, raw);
  const fee = total == null ? null : CARD.feeFixedUsd + total * CARD.feePct / 100;
  const extra = total == null || sub == null || fee == null ? 0 : Math.max(0, total - fee - sub);
  const enough = needSei != null && bal >= BigInt(Math.ceil(needSei * 1e18));

  // order-complete: Transak iframe postMessage + balance polling
  useEffect(() => {
    if (step !== "pay" && step !== "wait") return;
    const onMsg = (e: MessageEvent) => { const id = (e.data && (e.data.event_id || e.data.eventName)) || ""; if (String(id).includes("ORDER_SUCCESSFUL") || String(id).includes("ORDER_COMPLETED")) setStep("wait"); };
    window.addEventListener("message", onMsg);
    const t = setInterval(async () => { if (!addr) return; const b = await chain.pub.getBalance({ address: addr as Address }).catch(() => 0n); setBal(b); if (needSei != null && b >= BigInt(Math.ceil(needSei * 1e18))) { clearInterval(t); buyRef.current(); } }, 5000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(t); };
  }, [step, addr, needSei]);

  const begin = async () => {
    setErr(null);
    let a = addr; if (!a) { await connect(); try { a = await chain.connect(); } catch { return; } }
    const b = await chain.pub.getBalance({ address: a as Address }).catch(() => 0n);
    start.current = b; setBal(b); setStep("pay");
  };
  const buy = async () => {
    setErr(null); setStep("buying");
    try {
      const before = await chain.readBalance(addr as Address);
      const h = await chain.buy(n);
      const after = await chain.readBalance(addr as Address);
      setRcpt({ hash: h, got: after - before, sei: Number(formatEther(cost ?? 0n)) }); setStep("done"); onDone();
    } catch (e) { setErr((e as Error).message.split("\n")[0]); setStep("confirm"); }
  };
  const buyRef = useRef(buy); buyRef.current = buy;
  const idx = STEPS.findIndex(([s]) => s.includes(step));

  return <div className="pd-mbody cb">
    <div className="pd-mh dark">Buy PATRON <span className="pd-demo live">TESTNET</span></div>
    <ol className="cb-steps">{STEPS.map(([, l], i) => <li key={l} className={i < idx ? "ok" : i === idx ? "on" : ""}><b>{i < idx ? "✓" : i + 1}</b>{l}</li>)}</ol>

    {step === "quote" && <>
      <em>Item: <b>$PATRON</b></em>
      <div className="pd-card-f cb-n"><div><b>{n} PATRON</b><small>you receive</small></div>
        <div className="pd-step"><button onClick={() => setN(Math.max(1, n - 1))}>-</button><span>{n}</span><button onClick={() => setN(Math.min(max, n + 1))}>+</button></div></div>
      <dl className="pd-dl">
        <dt>PATRON price</dt><dd>{curveSei == null ? "…" : `${f4(curveSei)} SEI ≈ ${usd(curveSei * CARD.seiUsd)}`}</dd>
        <dt>Small network cost</dt><dd>{f4(CARD.gasBufferSei)} SEI ≈ {usd(CARD.gasBufferSei * CARD.seiUsd)}</dd>
        <dt>Payment fee (Transak, est. {CARD.feePct}% + {usd(CARD.feeFixedUsd)})</dt><dd>{fee == null ? "…" : usd(fee)}</dd>
        {extra > 0.005 && <><dt>Extra SEI to reach the {usd(CARD.minUsd)} minimum (stays in your wallet)</dt><dd>{usd(extra)}</dd></>}
        <dt><b>Total (estimate)</b></dt><dd><b>{total == null ? "…" : usd(total)}</b></dd>
      </dl>
      <small className="pd-fine">Payment runs through our partner Transak via SEI: your card buys SEI, then that SEI buys PATRON from the curve. Fees and FX are estimates; Transak shows the exact amount. Minimum {usd(CARD.minUsd)}. Leftover SEI stays in your wallet. Network fees (gas) are paid in SEI. The price is set by the curve at purchase time, with up to 1% slippage allowed.</small>
      {isPlaceholderKey() && <small className="pd-fine">⚠ Placeholder test key (Transak STAGING, no real charge).</small>}
      <button className="pd-buy" disabled={total == null} onClick={begin}>{`Buy ${n} PATRON (card / Apple Pay)`}</button>
    </>}

    {(step === "pay" || step === "wait") && <>
      <em>Paying for <b>{n} PATRON</b>{total == null ? "" : ` (est. ${usd(total)})`}</em>
      <small className="pd-fine">Below is the Transak checkout. It may ask for ID and show SEI. Once SEI arrives in your wallet, we continue to the PATRON purchase automatically.</small>
      {step === "pay" && addr && total != null && <iframe className="cb-tk" title="Transak" src={transakUrl(addr, total)} allow="camera;microphone;payment" />}
      {step === "pay" && addr && total != null && <a className="pd-fine" href={transakUrl(addr, total)} target="_blank" rel="noreferrer">Checkout not showing? Open in a new tab ↗</a>}
      <div className="pd-fine">{step === "wait" ? "Payment done. Waiting for SEI to arrive…" : "Checking for SEI…"} Balance {f4(Number(formatEther(bal)))} / needed {needSei == null ? "…" : f4(needSei)} SEI</div>
      {enough && <button className="pd-buy" onClick={buy}>Continue to receive PATRON</button>}
    </>}

    {(step === "confirm" || step === "buying") && <>
      <em>Final step: buy <b>{n} PATRON</b> with the SEI you received (max <b>{curveSei == null ? "" : f4(curveSei)}</b> SEI).</em>
      <small className="pd-fine">Your SEI arrived, so we opened your wallet to finish buying PATRON. If you closed it, tap the button below.</small>
      <button className="pd-buy" disabled={step === "buying"} onClick={buy}>{step === "buying" ? "Confirm in wallet…" : `Approve and receive ${n} PATRON`}</button>
    </>}

    {step === "done" && rcpt && <>
      <div className="cb-rcpt"><small>Receipt</small><b>{rcpt.got} PATRON</b><span>received</span></div>
      <dl className="pd-dl"><dt>Item</dt><dd>$PATRON</dd><dt>SEI paid</dt><dd>{f4(rcpt.sei)} SEI</dd><dt>Card payment</dt><dd>via Transak (receipt by email)</dd><dt>Wallet</dt><dd><a onClick={() => chain.watchPatron()}>Show PATRON in wallet ↗</a></dd><dt>Transaction</dt><dd><a href={chain.explorerTx(rcpt.hash)} target="_blank" rel="noreferrer">View on explorer ↗</a></dd></dl>
    </>}
    {err && <div className="pd-err">{err}</div>}
  </div>;
}
