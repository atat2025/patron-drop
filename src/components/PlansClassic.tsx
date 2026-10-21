"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import Mustache from "./Mustache";
import { CHAINS } from "@/lib/chains";
import * as P from "@/lib/plans";
import { fmtUsd } from "@/lib/seiUsd";
import { ResidencyCheck, useResidency } from "@/lib/residency";

/** /vault/ in the original vault-page look, wired to the 3 mainnet PlanVaults on Sei. */
const CH = CHAINS[0];
const KIND = ["Check", "Sold SEI for USDC", "Bought SEI with USDC", "Sold PATRON for SEI", "Bought PATRON with SEI", "Money in", "Money out"];
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const ago = (t: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - t)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const num = (v: bigint, d: number, max = 4) => Number(formatUnits(v, d)).toLocaleString("en-US", { maximumFractionDigits: max });
const assetUsd = (v: P.PlanView, a: bigint) => { const x = Number(formatUnits(a, v.cfg.decimals)); return v.cfg.id === "usdc" ? x : v.cfg.id === "sei" ? x * v.usdPerSei : x * v.patSei * v.usdPerSei; };
const totalUsd = (v: P.PlanView) => Number(formatUnits(v.sei, 18)) * v.usdPerSei + Number(formatUnits(v.usdc, 6)) + Number(formatUnits(v.pat, 18)) * v.patSei * v.usdPerSei;
const QUICK: Record<string, string[]> = { pat: ["100", "500", "1000"], usdc: ["1", "5", "10"], sei: ["1", "5", "10"] };

function stats(v: P.PlanView) {
  const series = [...v.hist.map((h) => h.pps), v.pps].filter((x) => x > 0);
  let peak = series[0] || 1, dd = 0;
  for (const x of series) { peak = Math.max(peak, x); dd = Math.max(dd, (peak - x) / peak); }
  const trades = v.hist.filter((h) => h.kind >= 1 && h.kind <= 4).length;
  return { series: series.length ? series : [1], ret: (v.pps - 1) * 100, dd: dd * 100, trades };
}
function Spark({ d, w = 120, h = 34, big = false }: { d: number[]; w?: number; h?: number; big?: boolean }) {
  const p0 = d.length > 1 ? d : [d[0] ?? 1, d[0] ?? 1];
  const mn = Math.min(...p0), mx = Math.max(...p0);
  const pts = p0.map((v, i) => `${(i / (p0.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(" ");
  const col = p0[p0.length - 1] >= p0[0] ? "#1a8f4c" : "#ff0047";
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pv-spark"><polyline points={pts} fill="none" stroke={col} strokeWidth={big ? 1.6 : 1.4} vectorEffect="non-scaling-stroke" />{big && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={col} opacity=".08" />}</svg>;
}
const Dot = ({ on }: { on: boolean }) => <i className="pv-dot" style={{ background: on ? "#1a8f4c" : "#bbb", boxShadow: "none" }} />;

function Estimate({ v }: { v: P.PlanView }) {
  const [open, setOpen] = useState(false);
  const est = P.monthEstimate(v.hist, v.pps);
  return <>
    <button className="pd-sec sm" onClick={(e) => { e.stopPropagation(); setOpen(!open); }} aria-expanded={open}>{open ? "▾" : "▸"} What you might get</button>
    {open && <div className="pv-get" onClick={(e) => e.stopPropagation()}>
      {est == null ? <span>Not enough history yet. Check back after a week.</span> : <span>Put in $10 → about <b>{fmtUsd(est)}</b> in a month, based on how it did so far.</span>}
      <span className="pd-err" style={{ padding: "4px 8px" }}>You can also lose money.</span></div>}
  </>;
}

export default function PlansClassic({ drop = "../" }: { drop?: string }) {
  const ok = useResidency();
  const [me, setMe] = useState<Address | null>(null);
  const [vs, setVs] = useState<P.PlanView[] | null>(null);
  const [sid, setSid] = useState<string>("pat");
  const [amt, setAmt] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ t: string; h?: string; err?: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => { try { setVs(await Promise.all(CH.plans.map((p) => P.readPlan(CH, p, me)))); setErr(null); } catch (e) { setErr("Could not load: " + (e as Error).message.split("\n")[0]); } }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const doConnect = async () => { try { setMe(await P.connect(CH)); } catch (e) { setNote({ t: (e as Error).message, err: true }); } };
  const run = async (label: string, f: () => Promise<string>) => { setBusy(label); setNote(null); try { const h = await f(); setNote({ t: `${label}: done`, h }); load(); } catch (e) { setNote({ t: (e as Error).message.split("\n")[0], err: true }); } setBusy(null); };

  const rows = useMemo(() => (vs || []).map((v) => ({ v, s: stats(v) })), [vs]);
  const board = [...rows].sort((a, b) => b.s.ret - a.s.ret);
  const chosen = rows.find((r) => r.v.cfg.id === sid);
  const tvl = rows.reduce((s, r) => s + totalUsd(r.v), 0);
  const pos = rows.filter((r) => r.v.mine > 0n);
  const feed = rows.flatMap((r) => r.v.hist.filter((h) => h.kind > 0).map((h) => ({ r, h }))).sort((a, b) => b.h.t - a.h.t).slice(0, 8);
  const lastCheck = Math.max(0, ...rows.flatMap((r) => r.v.hist.map((h) => h.t)));
  let wei = 0n; try { wei = chosen && amt ? parseUnits(amt, chosen.v.cfg.decimals) : 0n; } catch {}
  const minIn = chosen ? parseUnits(chosen.v.cfg.minIn, chosen.v.cfg.decimals) : 0n;
  const d = detail ? rows.find((r) => r.v.cfg.id === detail) : null;

  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions"><button className="pd-wallet" onClick={doConnect}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect wallet"}</button></div>
      </header>
      <main className="pv-main">
        <section className="pd-card pv-hero">
          <div className="pd-card-h"><h1>Automated trading</h1><p>Put money in, pick a plan, it buys and sells for you</p></div>
          <span className="pd-chip">SEI</span>
        </section>
        <section id="vault" className="pv">
          <div className="pv-disc">Your money is traded automatically for you. It can go up or down, and you could lose some or all of it. Not financial advice.</div>
          {err && <div className="pd-err">{err}</div>}
          <div className="pv-grid2">
            <div className="pv-card">
              <div className="pv-h"><h3>Put money in</h3><span className="pd-demo live">SEI</span></div>
              <label className="pv-lab">Pick a plan</label>
              <div className="pv-pick">
                {rows.map(({ v, s }) => <button key={v.cfg.id} className={sid === v.cfg.id ? "on" : ""} onClick={() => { setSid(v.cfg.id); setAmt(""); }}><Dot on={!v.paused} /><b>{v.cfg.title}</b><em className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</em></button>)}
                {!vs && <p className="pv-mut">Loading…</p>}
              </div>
              <label className="pv-lab">How much</label>
              <div className="pv-inp"><input inputMode="decimal" placeholder={chosen ? `at least ${chosen.v.cfg.minIn}` : ""} value={amt} onChange={(e) => setAmt(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} /><span>{chosen?.v.cfg.asset}</span></div>
              <div className="pv-quick">{(QUICK[sid] || []).map((q) => <button key={q} onClick={() => setAmt(q)}>{q}</button>)}
                <span>{chosen && wei > 0n ? fmtUsd(assetUsd(chosen.v, wei)) : ""}{chosen && me ? ` · you have ${num(chosen.v.wallet, chosen.v.cfg.decimals, 2)}` : ""}</span></div>
              {!me ? <button className="pd-buy" onClick={doConnect}>Connect wallet</button>
                : <button className="pd-buy" disabled={wei < minIn || wei <= 0n || !!busy || chosen?.v.paused} onClick={() => setConfirm(true)}>{wei < minIn ? `At least ${chosen?.v.cfg.minIn} ${chosen?.v.cfg.asset}` : "Next"}</button>}
              {note && <div className={note.err ? "pd-err" : "pv-ok"}>{note.t}{note.h && <> · <a href={`${CH.explorer}/tx/${note.h}`} target="_blank" rel="noreferrer">see receipt ↗</a></>}</div>}
            </div>
            <div className="pv-card">
              <div className="pv-h"><h3>Your money</h3><span className="pv-mut">Everyone together: {fmtUsd(tvl)}</span></div>
              {pos.length === 0 && <p className="pv-mut">{me ? "You have not put money in yet." : "Connect your wallet to see your money."}</p>}
              {pos.map(({ v }) => (
                <div key={v.cfg.id} className="pv-pos">
                  <div><b>{v.cfg.title}</b><small><Dot on={!v.paused} />{num(v.mineValue, v.cfg.decimals)} {v.cfg.asset}</small></div>
                  <div className="r"><b>{fmtUsd(assetUsd(v, v.mineValue))}</b><small>worth now</small></div>
                  <button className="pv-wd" disabled={!!busy} onClick={() => run("Take money out", () => P.takeOut(CH, v.cfg, v.mine))}>{busy === "Take money out" ? "…" : "Take money out"}</button>
                </div>))}
              <div className="pv-h" style={{ marginTop: 14 }}><h3>Live activity</h3><span className="pv-live"><Dot on />{lastCheck ? `last check ${ago(lastCheck)} ago` : "live"}</span></div>
              <ul className="pv-feed">{feed.map(({ r, h }, i) => <li key={i}><b>{r.v.cfg.title}</b> {KIND[h.kind].toLowerCase()}<span>{ago(h.t)}</span></li>)}
                {!feed.length && <li>Nothing bought or sold yet. It starts after the first deposit.</li>}</ul>
            </div>
          </div>

          <div className="pv-h" style={{ marginTop: 26 }}><h2 className="pv-h2">Automated trading plans</h2></div>
          <div className="pv-legend"><span><Dot on />On (checks every few hours)</span><span>Lines show how it did</span></div>
          <div className="pv-tiles">
            {rows.map(({ v, s }) => (
              <div key={v.cfg.id} className="pv-tile" role="button" onClick={() => setDetail(v.cfg.id)}>
                <div className="pv-h"><b>{v.cfg.title}</b><span className="pv-st"><Dot on={!v.paused} />{v.paused ? "Stopped" : "On"}</span></div>
                <small className="pv-mut">{v.cfg.blurb}</small>
                <div className={"pv-net " + (s.ret >= 0 ? "up" : "dn")}>{pct(s.ret)}<small>HOW IT DID</small></div>
                <Spark d={s.series} />
                <div className="pv-kpi"><span>Money in it<b>{fmtUsd(totalUsd(v))}</b></span><span>Worst drop<b>{s.dd.toFixed(2)}%</b></span><span>Trades<b>{s.trades}</b></span></div>
                <small className="pv-mut">We keep {v.fee}% of profit, only when you make money. Profit paid in USDC.</small>
                <Estimate v={v} />
              </div>))}
          </div>

          <div className="pv-card" style={{ marginTop: 20 }}>
            <div className="pv-h"><h3>Who did best</h3><span className="pv-mut">best first</span></div>
            <table className="pv-board"><thead><tr><th>#</th><th>Plan</th><th>Money in it</th><th>How it did</th><th>Worst drop</th><th>Trades</th></tr></thead><tbody>
              {board.map(({ v, s }, i) => <tr key={v.cfg.id} onClick={() => setDetail(v.cfg.id)}><td>{i + 1}</td><td><b>{v.cfg.title}</b></td><td>{fmtUsd(totalUsd(v))}</td><td className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</td><td>{s.dd.toFixed(2)}%</td><td>{s.trades}</td></tr>)}
            </tbody></table>
          </div>

          {confirm && chosen && (
            <div className="pv-modal" onClick={() => setConfirm(false)}>
              <div className="pv-card pv-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="pv-h"><h3>Check and put in</h3><span className="pd-demo live">SEI</span></div>
                <div className="pv-big">{fmtUsd(assetUsd(chosen.v, wei))} <small>({amt} {chosen.v.cfg.asset})</small></div>
                <div className="pv-row"><span>Plan</span><b>{chosen.v.cfg.title}</b></div>
                <div className="pv-row"><span>How it works</span><b style={{ textAlign: "right", maxWidth: 220 }}>{chosen.v.cfg.blurb}</b></div>
                <div className="pv-row"><span>Our share</span><b>{chosen.v.fee}% of profit, paid in USDC</b></div>
                <ResidencyCheck />
                <p className="pv-warn">The robot can only trade inside the plan. It can never take your money. Only you can take your money out, any time. Not financial advice.</p>
                <div className="pv-btns"><button className="pd-sec" onClick={() => setConfirm(false)}>Cancel</button>
                  <button className="pd-buy" disabled={!!busy || !ok} onClick={async () => { setConfirm(false); await run("Put money in", () => P.putIn(CH, chosen.v.cfg, wei)); setAmt(""); }}>Put money in</button></div>
              </div>
            </div>)}
          {d && (
            <div className="pv-modal" onClick={() => setDetail(null)}>
              <div className="pv-card pv-sheet wide" onClick={(e) => e.stopPropagation()}>
                <div className="pv-h"><h3>{d.v.cfg.title}</h3><button className="pv-x" onClick={() => setDetail(null)}>×</button></div>
                <small className="pv-mut"><Dot on={!d.v.paused} />{d.v.cfg.blurb}</small>
                <div className={"pv-net big " + (d.s.ret >= 0 ? "up" : "dn")}>{pct(d.s.ret)}<small>HOW IT DID</small></div>
                <div className="pv-curve"><Spark d={d.s.series} w={400} h={140} big /></div>
                <div className="pv-kpi"><span>Money in it<b>{fmtUsd(totalUsd(d.v))}</b></span><span>Holding now<b>{num(d.v.pat, 18, 0)} PAT · {num(d.v.sei, 18, 2)} SEI · {num(d.v.usdc, 6, 2)} USDC</b></span><span>Trades<b>{d.s.trades}</b></span></div>
                <h4 className="pv-lab">What it did</h4>
                <table className="pv-board"><tbody>{[...d.v.hist].reverse().slice(0, 12).map((h, i) => <tr key={i}><td>{new Date(h.t * 1000).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{KIND[h.kind]}</td></tr>)}
                  {!d.v.hist.length && <tr><td>Nothing yet.</td></tr>}</tbody></table>
                <small className="pv-mut">Contract <a href={`${CH.explorer}/address/${d.v.cfg.address}`} target="_blank" rel="noreferrer">{d.v.cfg.address.slice(0, 10)}… ↗</a></small>
                <button className="pd-buy" onClick={() => { setSid(d.v.cfg.id); setDetail(null); document.getElementById("vault")?.scrollIntoView({ behavior: "smooth" }); }} disabled={d.v.paused}>{d.v.paused ? "Stopped" : "Put money in this plan"}</button>
              </div>
            </div>)}
        </section>
        <p className="pd-foot">{CH.plans.length} plans on Sei · <a href={drop}>PATRON</a></p>
      </main>
    </div>
  );
}
