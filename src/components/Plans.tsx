"use client";
import { useCallback, useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import Mustache from "./Mustache";
import { CHAINS, type ChainCfg } from "@/lib/chains";
import * as P from "@/lib/plans";
import { fmtUsd } from "@/lib/seiUsd";
import { ResidencyCheck, useResidency } from "@/lib/residency";

const num = (v: bigint, d: number, max = 4) => Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max });

function assetUsd(v: P.PlanView, amount: bigint) {
  const x = Number(formatUnits(amount, v.cfg.decimals));
  return v.cfg.id === "usdc" ? x : v.cfg.id === "sei" ? x * v.usdPerSei : x * v.patSei * v.usdPerSei;
}
function holdingsUsd(v: P.PlanView) {
  return Number(formatUnits(v.sei, 18)) * v.usdPerSei + Number(formatUnits(v.usdc, 6)) + Number(formatUnits(v.pat, 18)) * v.patSei * v.usdPerSei;
}

function PlanCard({ chain, v, me, onConnect, refresh }: { chain: ChainCfg; v: P.PlanView; me: Address | null; onConnect: () => void; refresh: () => void }) {
  const ok = useResidency();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"in" | "out" | null>(null);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string; h?: string } | null>(null);
  const est = P.monthEstimate(v.hist, v.pps);
  const myUsd = assetUsd(v, v.mineValue);
  let wei = 0n; try { wei = amt ? parseUnits(amt, v.cfg.decimals) : 0n; } catch {}
  const run = async (f: () => Promise<string>, done: string) => {
    setBusy(true); setMsg(null);
    try { const h = await f(); setMsg({ ok: true, t: done, h }); setAmt(""); setMode(null); refresh(); } catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); }
    setBusy(false);
  };
  return (
    <section className="pv-card">
      <div className="pv-h"><h3>{v.cfg.title}</h3>{v.paused && <span className="pv-mut">Paused</span>}</div>
      <p className="pd-fine" style={{ margin: 0 }}>{v.cfg.blurb}</p>
      <p className="pd-fine" style={{ margin: 0 }}><b>We keep {v.fee}% of the profit, only when you make money.</b> Profit is paid in USDC.</p>
      {me && <div className="br-row"><small>Your money</small><span style={{ textAlign: "right" }}><b>{fmtUsd(myUsd)}</b><br /><small>{num(v.mineValue, v.cfg.decimals)} {v.cfg.asset}</small></span></div>}
      <div className="br-row"><small>Everyone together</small><small>{fmtUsd(holdingsUsd(v))}</small></div>
      <button className="pd-sec sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "▾" : "▸"} What you might get</button>
      {open && <div className="pv-get">
        {est == null ? <span>Not enough history yet. Check back after a week.</span>
          : <span>Put in $10 → about <b>{fmtUsd(est)}</b> in a month, based on how it did so far.</span>}
        <span className="pd-err" style={{ padding: "4px 8px" }}>You can also lose money.</span>
      </div>}
      {!me ? <button className="pd-buy" onClick={onConnect}>Connect wallet</button>
        : mode === null ? <div className="pd-srow">
            <button className="pd-buy sm" disabled={v.paused} onClick={() => setMode("in")}>Put money in</button>
            <button className="pd-sec sm" disabled={v.mine === 0n} onClick={() => run(() => P.takeOut(chain, v.cfg, v.mine), "Money taken out")}>{busy ? "…" : "Take money out"}</button></div>
        : <>
            <div className="pv-inp"><input inputMode="decimal" placeholder={`at least ${v.cfg.minIn}`} value={amt} onChange={(e) => setAmt(e.target.value.replace(",", "."))} /><span>{v.cfg.asset}</span></div>
            <div className="br-row"><small>In your wallet: {num(v.wallet, v.cfg.decimals)} {v.cfg.asset}</small><small>{wei > 0n ? fmtUsd(assetUsd(v, wei)) : ""}</small></div>
            <ResidencyCheck />
            <div className="pd-srow"><button className="pd-sec sm" onClick={() => setMode(null)}>Cancel</button>
              <button className="pd-buy sm" disabled={busy || !ok || wei <= 0n} onClick={() => run(() => P.putIn(chain, v.cfg, wei), "Money put in")}>{busy ? "Confirm in wallet…" : "Put money in"}</button></div>
          </>}
      {msg && <div className={msg.ok ? "pv-ok" : "pd-err"}>{msg.t}{msg.h && <> · <a href={`${chain.explorer}/tx/${msg.h}`} target="_blank" rel="noreferrer">see receipt ↗</a></>}</div>}
    </section>
  );
}

export default function PlansPage({ drop = "../" }: { drop?: string }) {
  const [ck, setCk] = useState("sei");
  const chain = CHAINS.find((c) => c.key === ck)!;
  const [me, setMe] = useState<Address | null>(null);
  const [vs, setVs] = useState<P.PlanView[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!chain.enabled) { setVs([]); return; }
    try { setVs(await Promise.all(chain.plans.map((p) => P.readPlan(chain, p, me)))); setErr(null); } catch (e) { setErr("Could not load: " + (e as Error).message.split("\n")[0]); }
  }, [chain, me]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const connect = async () => { try { setMe(await P.connect(chain)); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">SEI</span>
          <button className="pd-wallet" onClick={connect}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>Let it trade for you</h1><p>Pick a plan, put money in, take it out any time</p></div>
        </section>
        <div className="pd-tabs" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
          {CHAINS.map((c) => <button key={c.key} className={c.key === ck ? "on" : ""} disabled={!c.enabled} onClick={() => setCk(c.key)}>{c.name}{c.enabled ? "" : " · soon"}</button>)}
        </div>
        {err && <div className="pd-err">{err}</div>}
        {!vs && <p className="pd-fine">Loading…</p>}
        {vs?.map((v) => <PlanCard key={v.cfg.id} chain={chain} v={v} me={me} onConnect={connect} refresh={load} />)}
        <p className="pd-fine">A robot checks prices every few hours and trades a little for you. It can never take your money. When you take money out, you get your part of everything the plan holds (your coin, plus any USDC profit). Not financial advice.</p>
      </main>
    </div>
  );
}
