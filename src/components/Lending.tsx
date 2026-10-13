"use client";
import { useState } from "react";
import Link from "next/link";
import Mustache from "./Mustache";
import { PLATFORMS, TERMS, valuate, quote, mockStats, man, yen, fmtN, type Platform, type Conn } from "@/lib/creatorFinance";

type Step = "connect" | "value" | "terms" | "done";
export default function Lending() {
  const [step, setStep] = useState<Step>("connect");
  const [handle, setHandle] = useState("");
  const [plats, setPlats] = useState<Platform[]>(["youtube", "x"]);
  const [conns, setConns] = useState<Conn[]>([]);
  const [amt, setAmt] = useState(0);
  const [term, setTerm] = useState<number>(12);
  const [agree, setAgree] = useState(false);
  const v = conns.length ? valuate(conns) : null;
  const q = v ? quote(amt, term, v.monthly) : null;
  const go = () => { const c = plats.map((p) => mockStats(p, handle)); setConns(c); const val = valuate(c); setAmt(Math.max(10000, Math.floor(val.maxAdvance / 2 / 10000) * 10000)); setStep("value"); };
  return (
    <div className="pd">
      <header className="pd-top"><Link className="pd-brand" href="/"><Mustache size={22} /><span>patron<i>_</i></span></Link><span className="pd-demo">DEMO</span></header>
      <main className="pd-main">
        <section className="pd-card"><div className="pd-card-h"><h1>Creator Financing</h1><p>クリエイター融資 · メディア権利の取得</p></div>
          {v && <div className="lf-big"><small>IP評価額（参考値）</small><b>{man(v.value)}</b><small>最大 {man(v.maxAdvance)}</small></div>}
        </section>
        <div className="pd-info">SNS・IP・メディア収益の権利をPATRONが取得し、その対価を前払いでお支払いします。返済は固定ではなく、収益の一定割合で精算します。<br /><small className="ux-mut">DEMO: 査定は公開の簡易式による参考値。実際の送金・契約は行われません。要法務レビュー。</small></div>

        {step === "connect" && <>
          <label className="ux-inp lf-inp"><span>Handle</span><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourname" /></label>
          <div className="lf-chips">{(Object.keys(PLATFORMS) as Platform[]).map((p) => <button key={p} className={plats.includes(p) ? "on" : ""} onClick={() => setPlats((s) => s.includes(p) ? s.filter((x) => x !== p) : [...s, p])}>{PLATFORMS[p].label}</button>)}</div>
          <button className="pd-buy" disabled={!handle || !plats.length} onClick={go}>SNSを連携して査定する</button>
        </>}

        {step !== "connect" && v && <div className="lf-tbl">
          {conns.map((c) => <div key={c.platform}><b>{PLATFORMS[c.platform as Platform].label}</b><span>{fmtN(c.followers)} followers</span><span>{yen(c.monthlyRevenue)}/月</span></div>)}
          <div><b>年間収益</b><span>{man(v.annual)}</span><span>倍率 ×{v.multiple}</span></div>
        </div>}

        {step === "value" && v && <button className="pd-buy" onClick={() => setStep("terms")}>条件を選ぶ</button>}

        {step === "terms" && v && q && <>
          <label className="ux-inp lf-inp"><span>金額</span><input type="range" min={10000} max={Math.max(10000, v.maxAdvance)} step={10000} value={amt} onChange={(e) => setAmt(+e.target.value)} /><em>{man(amt)}</em></label>
          <div className="pd-row lf-terms">{TERMS.map((t) => <button key={t} className={"pd-sec " + (term === t ? "on" : "")} onClick={() => setTerm(t)}>{t}ヶ月</button>)}</div>
          <div className="lf-tbl">
            <div><b>手数料</b><span>{(q.fee * 100).toFixed(0)}%</span><span>{yen(q.feeAmount)}</span></div>
            <div><b>精算総額</b><span>{yen(q.total)}</span><span /></div>
            <div><b>収益シェア</b><span>{q.sharePct}%</span><span>月 約{yen(q.monthlyEst)}</span></div>
          </div>
          <label className="lf-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />条件（ドラフト・DEMO）に同意します</label>
          <button className="pd-buy" disabled={!agree} onClick={() => setStep("done")}>申し込む（DEMO）</button>
        </>}

        {step === "done" && q && <div className="pd-info lf-done"><b>受付完了（DEMO）</b><br />{man(amt)} · {term}ヶ月 · 収益シェア {q.sharePct}%<br /><small className="ux-mut">モックです。実際の送金は行われていません。</small><br /><button className="pd-sec" onClick={() => { setStep("connect"); setAgree(false); }}>最初から</button></div>}
      </main>
    </div>
  );
}
