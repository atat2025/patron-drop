"use client";
import { useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import * as S from "@/lib/strategyVaults";
import { NET, isTestnet, explorerTx, explorerAddr } from "@/lib/network";
import { useSeiUsd, usdSei } from "@/lib/seiUsd";
import { ResidencyCheck, useResidency } from "@/lib/residency";

/* PATRON Vault: real on-chain strategy vaults (PatronStrategyVault) on the PATRON Edition 0 curve.
   NAV, trades and charts are read from the contracts; the keeper log (reasons + tx links) comes from the keeper job. */
const NAMES = S.META;
const f4 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const sei = (v: bigint) => usdSei(Number(formatEther(v)));
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const ago = (t: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - t)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const KIND = ["Check", "Buy", "Sell", "Money in", "Money out"];
const LABEL = NET.label;

function stats(v: S.VaultView) {
  const series = [...v.recs.map((r) => Number(r.ppsNano) / 1e9), Number(v.pps) / 1e18];
  let peak = series[0] || 1, dd = 0;
  for (const x of series) { peak = Math.max(peak, x); dd = Math.max(dd, (peak - x) / peak); }
  const trades = v.recs.filter((r) => r.kind === 1 || r.kind === 2);
  return { series, ret: ((Number(v.pps) / 1e18) - 1) * 100, dd: dd * 100, trades: trades.length, last: trades.length ? trades[trades.length - 1].time : 0 };
}

function Spark({ d, w = 120, h = 34, big = false }: { d: number[]; w?: number; h?: number; big?: boolean }) {
  const pts0 = d.length > 1 ? d : [d[0] ?? 1, d[0] ?? 1];
  const mn = Math.min(...pts0), mx = Math.max(...pts0);
  const pts = pts0.map((v, i) => `${(i / (pts0.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(" ");
  const col = pts0[pts0.length - 1] >= pts0[0] ? "#1a8f4c" : "#ff0047";
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pv-spark"><polyline points={pts} fill="none" stroke={col} strokeWidth={big ? 1.6 : 1.4} vectorEffect="non-scaling-stroke" />{big && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={col} opacity=".08" />}</svg>;
}
const Dot = ({ on }: { on: boolean }) => <i className="pv-dot" style={{ background: on ? "#1a8f4c" : "#bbb", boxShadow: "none" }} />;

export function Vault() {
  useSeiUsd();
  const resOk = useResidency();
  const [amt, setAmt] = useState("0.05");
  const [sid, setSid] = useState(NET.vaults[0]?.id || "");
  const [confirm, setConfirm] = useState(false);
  const [user, setUser] = useState<Address | null>(null);
  const [vs, setVs] = useState<S.VaultView[] | null>(null);
  const [log, setLog] = useState<S.KeeperEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ t: string; h?: string; err?: boolean } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const refresh = async (u = user) => { try { setVs(await S.readAll(u)); setErr(null); } catch (e) { setErr("Could not load: " + (e as Error).message.split("\n")[0]); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); const t = setInterval(() => refresh(), 10000); return () => clearInterval(t); }, [user]);
  useEffect(() => { S.readKeeperLog().then(setLog); const t = setInterval(() => S.readKeeperLog().then(setLog), 60000); return () => clearInterval(t); }, []);
  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(label); setNote(null);
    try { const h = await f(); setNote({ t: `${label}: done`, h }); await refresh(); }
    catch (e) { setNote({ t: (e as Error).message.split("\n")[0], err: true }); }
    setBusy(null);
  };
  const doConnect = async () => { try { const a = await S.connect(); setUser(a); refresh(a); } catch (e) { setNote({ t: (e as Error).message, err: true }); } };

  const rows = useMemo(() => (vs || []).map((v) => ({ v, m: NAMES[v.id], s: stats(v) })), [vs]);
  const board = [...rows].sort((a, b) => b.s.ret - a.s.ret);
  const chosen = rows.find((r) => r.v.id === sid);
  const pos = rows.filter((r) => r.v.mine > 0n);
  const tvl = rows.reduce((s, r) => s + r.v.nav, 0n);
  let wei = 0n; try { wei = parseEther(amt || "0"); } catch {}
  const feed = useMemo(() => {
    const real = log.filter((e) => e.tx && !e.checkpoint).slice(-8).reverse();
    if (real.length) return real.map((e) => ({ k: e.tx!, name: NAMES[e.vault]?.name || e.vault, txt: `${e.decision === "buy" ? "bought" : "sold"} ${e.amount} PATRON @ ${usdSei(e.price)}`, why: e.why, ago: ago(Date.parse(e.t) / 1000), tx: e.tx }));
    return rows.flatMap((r) => r.v.recs.map((x) => ({ r, x }))).filter(({ x }) => x.kind === 1 || x.kind === 2).sort((a, b) => b.x.time - a.x.time).slice(0, 8)
      .map(({ r, x }) => ({ k: r.v.id + x.time, name: r.m.name, txt: `${KIND[x.kind].toLowerCase()} ${x.amount} PATRON for ${usdSei(Number(x.seiGwei) / 1e9)}`, why: "", ago: ago(x.time), tx: undefined as string | undefined }));
  }, [log, rows]);
  const lastRun = log.length ? log[log.length - 1].t : null;
  const d = detail ? rows.find((r) => r.v.id === detail) : null;

  if (!NET.vaults.length) return <section id="vault" className="pv"><div className="pv-disc">Not ready yet.</div></section>;
  return (
    <section id="vault" className="pv">
      <div className="pv-disc">{isTestnet ? "Practice mode: play money, no real value. " : ""}Your money is traded automatically for you. It can go up or down, and you could lose some or all of it. Not financial advice.</div>
      {err && <div className="pd-err">{err}</div>}

      <div className="pv-grid2">
        <div className="pv-card">
          <div className="pv-h"><h3>Put money in</h3><span className="pd-demo live">{NET.label}</span></div>
          <label className="pv-lab">How much</label>
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} /><span>SEI</span></div>
          <div className="pv-quick">{["0.02", "0.05", "0.1"].map((v) => <button key={v} onClick={() => setAmt(v)}>{v}</button>)}<span>{NET.faucet && <a href={NET.faucet} target="_blank" rel="noreferrer">Get free practice SEI ↗</a>}</span></div>
          <label className="pv-lab">Pick a style</label>
          <div className="pv-pick">
            {rows.map(({ v, m, s }) => (
              <button key={v.id} className={sid === v.id ? "on" : ""} onClick={() => setSid(v.id)}><Dot on={!v.paused} /><b>{m.name}</b><em className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</em></button>
            ))}
            {!vs && <p className="pv-mut">Loading…</p>}
          </div>
          {!user ? <button className="pd-buy" onClick={doConnect}>Connect wallet</button>
            : <button className="pd-buy" disabled={wei < 1000000000000000n || !!busy} onClick={() => setConfirm(true)}>{wei < 1000000000000000n ? "At least 0.001 SEI" : "Next"}</button>}
          {note && <div className={note.err ? "pd-err" : "pv-ok"}>{note.t}{note.h && <> · <a href={explorerTx(note.h)} target="_blank" rel="noreferrer">see receipt ↗</a></>}</div>}
        </div>

        <div className="pv-card">
          <div className="pv-h"><h3>Your money</h3><span className="pv-mut">Everyone together: {sei(tvl)}</span></div>
          {pos.length === 0 && <p className="pv-mut">{user ? "You have not put money in yet." : "Connect your wallet to see your money."}</p>}
          {pos.map(({ v, m }) => (
            <div key={v.id} className="pv-pos">
              <div><b>{m.name}</b><small><Dot on={!v.paused} />{v.tok} PATRON + {sei(v.sei)}</small></div>
              <div className="r"><b>{sei(v.mineValue)}</b><small>worth now</small></div>
              <button className="pv-wd" disabled={!!busy} onClick={() => run("Take money out", () => S.withdraw(v.address, v.mine))}>{busy === "Take money out" ? "…" : "Take money out"}</button>
            </div>))}
          <div className="pv-h" style={{ marginTop: 14 }}><h3>What it just did</h3><span className="pv-live"><Dot on />{lastRun ? `last check ${ago(Date.parse(lastRun) / 1000)} ago` : "live"}</span></div>
          <ul className="pv-feed">{feed.map((f) => <li key={f.k} title={f.why}><b>{f.name}</b> {f.txt}{f.tx && <> · <a href={explorerTx(f.tx)} target="_blank" rel="noreferrer">tx ↗</a></>}<span>{f.ago}</span></li>)}
            {!feed.length && <li>Nothing bought or sold yet.</li>}</ul>
        </div>
      </div>

      <div className="pv-h" style={{ marginTop: 26 }}><h2 className="pv-h2">The styles</h2></div>
      <div className="pv-legend"><span><Dot on />On (checks every few hours)</span><span>Lines show how it did</span></div>
      <div className="pv-tiles">
        {rows.map(({ v, m, s }) => (
          <button key={v.id} className="pv-tile" onClick={() => setDetail(v.id)}>
            <div className="pv-h"><b>{m.name}</b><span className="pv-st"><Dot on={!v.paused} />{v.paused ? "Stopped" : "On"}</span></div>
            <small className="pv-mut">{m.agent}</small>
            <div className={"pv-net " + (s.ret >= 0 ? "up" : "dn")}>{pct(s.ret)}<small>HOW IT DID</small></div>
            <Spark d={s.series} />
            <div className="pv-kpi"><span>Money in it<b>{sei(v.nav)}</b></span><span>Worst drop<b>{s.dd.toFixed(2)}%</b></span><span>Buys/sells<b>{s.trades}</b></span></div>
          </button>
        ))}
      </div>

      <div className="pv-card" style={{ marginTop: 20 }}>
        <div className="pv-h"><h3>Who did best</h3><span className="pv-mut">best first</span></div>
        <table className="pv-board"><thead><tr><th>#</th><th>Style</th><th>Money in it</th><th>How it did</th><th>Worst drop</th><th>Buys/sells</th></tr></thead><tbody>
          {board.map(({ v, m, s }, i) => <tr key={v.id} onClick={() => setDetail(v.id)}><td>{i + 1}</td><td><b>{m.name}</b></td><td>{sei(v.nav)}</td><td className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</td><td>{s.dd.toFixed(2)}%</td><td>{s.trades}</td></tr>)}
        </tbody></table>
      </div>

      {confirm && chosen && (
        <div className="pv-modal" onClick={() => setConfirm(false)}>
          <div className="pv-card pv-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>Check and put in</h3><span className="pd-demo live">{NET.label}</span></div>
            <div className="pv-big">{usdSei(Number(amt) || 0).split(" (")[0]} <small>({amt} SEI)</small></div>
            <div className="pv-row"><span>Style</span><b>{chosen.m.name}</b></div>
            <div className="pv-row"><span>How it works</span><b style={{ textAlign: "right", maxWidth: 220 }}>{chosen.m.rule}</b></div>
            <div className="pv-row"><span>Worst drop so far</span><b>{chosen.s.dd.toFixed(2)}%</b></div>
            <ResidencyCheck />
            <p className="pv-warn">The robot can only buy and sell PATRON for you. It can never take your money. Only you can take your money out, any time. Not financial advice.</p>
            <div className="pv-btns"><button className="pd-sec" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="pd-buy" disabled={!!busy || !resOk} onClick={async () => { if (!resOk) return; setConfirm(false); await run("Put money in", () => S.deposit(chosen.v.address, wei)); }} >Put money in</button></div>
          </div>
        </div>
      )}
      {d && (
        <div className="pv-modal" onClick={() => setDetail(null)}>
          <div className="pv-card pv-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>{d.m.name}</h3><button className="pv-x" onClick={() => setDetail(null)}>×</button></div>
            <small className="pv-mut"><Dot on={!d.v.paused} />{d.m.agent} · {d.m.rule}</small>
            <div className={"pv-net big " + (d.s.ret >= 0 ? "up" : "dn")}>{pct(d.s.ret)}<small>HOW IT DID</small></div>
            <div className="pv-curve"><Spark d={d.s.series} w={400} h={140} big /></div>
            <div className="pv-kpi"><span>Money in it<b>{sei(d.v.nav)}</b></span><span>Holding now<b>{d.v.tok} PATRON + {sei(d.v.sei)}</b></span><span>Buys/sells<b>{d.s.trades}</b></span></div>
            <h4 className="pv-lab">What it did</h4>
            <table className="pv-board"><tbody>{[...d.v.recs].reverse().slice(0, 12).map((r, i) => <tr key={i}><td>{new Date(r.time * 1000).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{KIND[r.kind]}</td><td>{r.kind === 1 || r.kind === 2 ? `${r.amount} PATRON` : ""}</td><td>{r.seiGwei ? usdSei(Number(r.seiGwei) / 1e9) : ""}</td><td>Total {usdSei(Number(r.navGwei) / 1e9)}</td></tr>)}</tbody></table>
            <small className="pv-mut">Contract <a href={explorerAddr(d.v.address)} target="_blank" rel="noreferrer">{d.v.address.slice(0, 10)}… ↗</a> · robot <a href={explorerAddr(d.v.keeper)} target="_blank" rel="noreferrer">{d.v.keeper.slice(0, 10)}… ↗</a></small>
            <button className="pd-buy" onClick={() => { setSid(d.v.id); setDetail(null); document.getElementById("vault")?.scrollIntoView({ behavior: "smooth" }); }} disabled={d.v.paused}>{d.v.paused ? "Stopped" : "Put money in this style"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

import Mustache from "./Mustache";
export default function VaultPage({ home = "", drop = "../" }: { home?: string; drop?: string }) {
  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">{NET.label}</span><a className="pd-wallet" href={drop}>PATRON</a></div>
      </header>
      <main className="pv-main">
        {isTestnet && <div className="pd-tn" role="note"><b>PRACTICE</b> Play money. No real value.</div>}
        
        <section className="pd-card pv-hero">
          <div className="pd-card-h"><h1>Automated trading</h1><p>Put money in, pick a style, it buys and sells for you</p></div>
          <span className="pd-chip">{NET.label}</span>
        </section>
        <Vault />
        <p className="pd-foot">{NET.vaults.length} styles · market <a href={explorerAddr(NET.market)} target="_blank" rel="noreferrer">{NET.market.slice(0, 10)}… ↗</a> · token <a href={explorerAddr(NET.token)} target="_blank" rel="noreferrer">{NET.token.slice(0, 10)}… ↗</a></p>
        {home && <p className="pd-foot"><a href={home} target="_blank" rel="noreferrer">patron.red →</a></p>}
      </main>
    </div>
  );
}
