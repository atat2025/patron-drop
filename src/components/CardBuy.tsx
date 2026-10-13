"use client";
import { useEffect, useRef, useState } from "react";
import { formatEther, type Address } from "viem";
import * as chain from "@/lib/patronChain";
import { CARD, isPlaceholderKey, transakUrl } from "@/lib/cardConfig";

type Step = "quote" | "pay" | "wait" | "confirm" | "buying" | "done";
const STEPS: [Step[], string][] = [[["quote"], "数量と金額の確認"], [["pay", "wait"], "お支払い（カード / Apple Pay）"], [["confirm", "buying"], "PATRONの受け取り（ウォレットで承認）"], [["done"], "完了・領収"]];
const f4 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CardBuy({ addr, connect, max, onDone }: { addr: string | null; connect: () => Promise<void> | void; max: number; onDone: () => void }) {
  const [step, setStep] = useState<Step>("quote");
  const [n, setN] = useState(1);
  const [cost, setCost] = useState<bigint | null>(null);
  const [notJp, setNotJp] = useState(false);
  const [tzJp, setTzJp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bal, setBal] = useState<bigint>(0n);
  const [rcpt, setRcpt] = useState<{ hash: string; got: number; sei: number } | null>(null);
  const start = useRef<bigint>(0n);
  useEffect(() => { try { setTzJp(Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tokyo"); } catch {} }, []);
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
    const t = setInterval(async () => { if (!addr) return; const b = await chain.pub.getBalance({ address: addr as Address }).catch(() => 0n); setBal(b); if (needSei != null && b >= BigInt(Math.ceil(needSei * 1e18))) setStep("confirm"); }, 5000);
    return () => { window.removeEventListener("message", onMsg); clearInterval(t); };
  }, [step, addr, needSei]);

  const begin = async () => {
    setErr(null);
    if (!addr) { await connect(); return; }
    const b = await chain.pub.getBalance({ address: addr as Address }).catch(() => 0n);
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
  const idx = STEPS.findIndex(([s]) => s.includes(step));

  return <div className="pd-mbody cb">
    <div className="pd-mh dark">PATRON購入 <span className="pd-demo live">TESTNET</span></div>
    <ol className="cb-steps">{STEPS.map(([, l], i) => <li key={l} className={i < idx ? "ok" : i === idx ? "on" : ""}><b>{i < idx ? "✓" : i + 1}</b>{l}</li>)}</ol>

    {step === "quote" && <>
      <em>購入するもの：<b>$PATRON（PATRON Edition 0）</b></em>
      <div className="pd-card-f cb-n"><div><b>{n} PATRON</b><small>受け取り予定</small></div>
        <div className="pd-step"><button onClick={() => setN(Math.max(1, n - 1))}>-</button><span>{n}</span><button onClick={() => setN(Math.min(max, n + 1))}>+</button></div></div>
      <dl className="pd-dl">
        <dt>PATRON代金（カーブ価格）</dt><dd>{curveSei == null ? "…" : `${f4(curveSei)} SEI ≈ ${usd(curveSei * CARD.seiUsd)}`}</dd>
        <dt>ネットワーク手数料の予備</dt><dd>{f4(CARD.gasBufferSei)} SEI ≈ {usd(CARD.gasBufferSei * CARD.seiUsd)}</dd>
        <dt>決済手数料（Transak, 目安 {CARD.feePct}% + {usd(CARD.feeFixedUsd)}）</dt><dd>{fee == null ? "…" : usd(fee)}</dd>
        {extra > 0.005 && <><dt>最低購入額（{usd(CARD.minUsd)}）による追加SEI（ウォレットに残ります）</dt><dd>{usd(extra)}</dd></>}
        <dt><b>お支払い合計（目安）</b></dt><dd><b>{total == null ? "…" : usd(total)}</b></dd>
      </dl>
      <small className="pd-fine">決済はパートナー（Transak）経由で、SEIを介して行われます。カードの代金でSEIを購入し、そのSEIでPATRONをカーブから購入します。手数料と為替は目安で、正確な金額はTransakの画面に表示されます。最低{usd(CARD.minUsd)}。余ったSEIはお客様のウォレットに残ります。ネットワーク手数料（ガス）はSEIで支払われます（無料ではありません）。価格は購入時点のカーブで決まり、最大1%の変動を許容します。</small>
      <div className="pd-err cb-jp">日本にお住まいの方は、現在カード購入をご利用いただけません。{tzJp && " お使いの端末は日本時間に設定されています。"}</div>
      <label className="pd-fine cb-chk"><input type="checkbox" checked={notJp} onChange={(e) => setNotJp(e.target.checked)} /> 私は日本の居住者ではありません（I am not a resident of Japan）</label>
      {isPlaceholderKey() && <small className="pd-fine">⚠ テスト用の仮APIキーです（Transak STAGING、実際の請求はありません）。</small>}
      <button className="pd-buy" disabled={!notJp || total == null} onClick={begin}>{addr ? `${n} PATRONを買う（カード / Apple Pay）` : "ウォレットを接続して続ける"}</button>
    </>}

    {(step === "pay" || step === "wait") && <>
      <em>お支払い中：<b>{n} PATRON</b>の購入（{total == null ? "" : `目安 ${usd(total)}`}）</em>
      <small className="pd-fine">下はパートナー（Transak）の決済画面です。本人確認やSEIの表示が出ることがあります。お支払い完了後、SEIがウォレットに届くと自動でPATRONの受け取りに進みます。</small>
      {step === "pay" && addr && total != null && <iframe className="cb-tk" title="Transak" src={transakUrl(addr, total)} allow="camera;microphone;payment" />}
      {step === "pay" && addr && total != null && <a className="pd-fine" href={transakUrl(addr, total)} target="_blank" rel="noreferrer">決済画面が表示されない場合は、別タブで開く ↗</a>}
      <div className="pd-fine">{step === "wait" ? "お支払い完了。ウォレットへの着金を待っています…" : "着金を確認中…"} 残高 {f4(Number(formatEther(bal)))} / 必要 {needSei == null ? "…" : f4(needSei)} SEI</div>
      {enough && <button className="pd-buy" onClick={() => setStep("confirm")}>PATRONの受け取りへ進む</button>}
    </>}

    {(step === "confirm" || step === "buying") && <>
      <em>最後の確認：<b>{n} PATRON</b>を、届いたSEI <b>{curveSei == null ? "" : f4(curveSei)}</b>（上限）でカーブから購入します。</em>
      <small className="pd-fine">MetaMaskで承認してください（PATRONのカーブ購入トランザクション、Sei テストネット）。</small>
      <button className="pd-buy" disabled={step === "buying"} onClick={buy}>{step === "buying" ? "ウォレットで承認中…" : `承認して ${n} PATRON を受け取る`}</button>
    </>}

    {step === "done" && rcpt && <>
      <div className="cb-rcpt"><small>領収</small><b>{rcpt.got} PATRON</b><span>受け取りました</span></div>
      <dl className="pd-dl"><dt>商品</dt><dd>$PATRON（Edition 0）</dd><dt>支払ったSEI（カーブ代金）</dt><dd>{f4(rcpt.sei)} SEI</dd><dt>カード決済</dt><dd>Transak経由（領収はTransakからメールで届きます）</dd><dt>取引</dt><dd><a href={chain.explorerTx(rcpt.hash)} target="_blank" rel="noreferrer">エクスプローラーで見る ↗</a></dd></dl>
    </>}
    {err && <div className="pd-err">{err}</div>}
  </div>;
}
