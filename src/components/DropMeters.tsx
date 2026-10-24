"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import * as V from "@/lib/vaultChain";
import { readGauge, GAUGE, type GaugeData } from "@/lib/gauge";
/** Gauge stages are stored in JPY on-chain; shown in USD (approx. FX) for the overseas release. */
const JPY_PER_USD = Number(process.env.NEXT_PUBLIC_JPY_PER_USD || "158");
const yen = (jpy: number) => "$" + Math.round(jpy / JPY_PER_USD).toLocaleString("en-US");

const TARGET = process.env.NEXT_PUBLIC_COUNTDOWN_TARGET || "2026-12-20T00:00:00+09:00";
const LABEL = process.env.NEXT_PUBLIC_COUNTDOWN_LABEL || "Release in";
const FARM_TARGET = Number(process.env.NEXT_PUBLIC_FARMING_TARGET || "1000000");

export function Countdown() {
  const t = Date.parse(TARGET);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const left = now == null ? null : Math.max(0, t - now);
  const parts = left == null ? ["--", "--", "--", "--"] : [86400e3, 3600e3, 60e3, 1e3].map((u, i, a) => String(Math.floor((i ? left % a[i - 1] : left) / u)).padStart(2, "0"));
  const ended = left === 0;
  return (
    <div className="dm-cd">
      <div className="dm-h"><span>{ended ? "Live now" : LABEL}</span><small>{new Date(t).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" })} JST</small></div>
      {ended ? <div className="dm-ended">🎉 Listing has started</div> :
        <div className="dm-grid">{parts.map((p, i) => <div key={i}><b>{p}</b><small>{["Days", "Hours", "Min", "Sec"][i]}</small></div>)}</div>}
    </div>
  );
}

const GAUGE_CACHE = "patron-gauge-v1";
const FALLBACK_GAUGE = (): GaugeData => ({
  stages: (process.env.NEXT_PUBLIC_GAUGE_STAGES || "300000000,500000000").split(",").map(Number),
  manualJPY: 0, note: "", tvlPAT: 0, patSEI: 0, onchainJPY: 0, history: [], owner: "", live: false,
});
function cachedGauge(): GaugeData | null {
  if (typeof window === "undefined") return null;
  try { const x = JSON.parse(localStorage.getItem(GAUGE_CACHE) || "null"); return x?.stages ? x as GaugeData : null; } catch { return null; }
}

/** Staged liquidity goal (JPY). On-chain value and operator-added value are shown as separate, labeled segments. */
export function LiquidityGauge() {
  const [d, setD] = useState<GaugeData | null>(() => cachedGauge() || FALLBACK_GAUGE());
  useEffect(() => {
    let alive = true;
    const load = () => {
      const t = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("gauge timeout")), 5000));
      Promise.race([readGauge(), t]).then((g) => {
        if (!alive) return;
        setD(g);
        try { localStorage.setItem(GAUGE_CACHE, JSON.stringify(g)); } catch {}
      }).catch(() => { if (alive && !cachedGauge()) setD(FALLBACK_GAUGE()); });
    };
    load(); const i = setInterval(load, 20000); return () => { alive = false; clearInterval(i); };
  }, []);
  if (!d) return <div className="dm-g"><div className="dm-h"><span>Goal incl. pledges & reservations</span></div><small>Loading…</small></div>;
  const total = d.onchainJPY + d.manualJPY;
  const reached = d.stages.filter((s) => total >= s).length;
  const next = d.stages[reached];
  const prev = reached ? d.stages[reached - 1] : 0;
  const scale = next ?? d.stages[d.stages.length - 1];
  const pctNext = next ? Math.min(100, ((total - prev) / (next - prev)) * 100) : 100;
  const w = (x: number) => `${Math.min(100, (x / scale) * 100)}%`;
  return (
    <div className="dm-g">
      <div className="dm-h"><span>Goal incl. pledges & reservations · {next ? `Stage ${reached + 1}` : "All stages reached"}</span><b>{next ? `${pctNext.toFixed(1)}% to next` : "100%"}</b></div>
      <div className="dm-bar dm-seg">
        <i className="on" style={{ width: w(total) }} title="Total incl. pledges" />
        {d.stages.map((s, k) => s <= scale && <span key={k} className="dm-tick" style={{ left: w(s) }} />)}
      </div>
      <div className="dm-leg">
        <div><i className="on" />On-chain (Vault TVL)<b>{yen(d.onchainJPY)}</b></div>
        <div><i className="on" />Pledges & reservations<b>{yen(d.manualJPY)}</b></div>
        {d.note && <p className="dm-note">Team note: {d.note}</p>}
        <div className="dm-tot">Total <b>{yen(total)}</b>{next && <> / next stage {yen(next)}</>}</div>
        <p className="dm-note">* Includes pledges and reservations, so it differs from on-chain purchases. Amounts in USD at an approximate rate.</p>
      </div>
      <div className="dm-stages">{d.stages.map((s, k) => <span key={k} className={total >= s ? "ok" : ""}>Stage {k + 1}: {yen(s)}</span>)}</div>
      <small>On-chain: {d.tvlPAT.toLocaleString("en-US", { maximumFractionDigits: 2 })} PAT in <Link href="/vault/">PatronVault</Link> × PAT {d.patSEI.toPrecision(3)} SEI (PatronLaunch), valued in USD (approx.).</small>
      <details className="dm-hist"><summary>Change history ({d.history.length})</summary>
        {d.history.length ? d.history.map((h, k) => <div key={k}><span>{new Date(h.at).toLocaleString("en-US")}</span>{h.kind === 1 ? <b>Team-added → {yen(h.amountJPY)}{h.note && ` (${h.note})`}</b> : <b>Stages → {h.stages.map(yen).join(" / ")}</b>}</div>) : <p>No changes</p>}
        <a href={`https://seitrace.com/address/${GAUGE}?chain=atlantic-2`} target="_blank" rel="noreferrer">GaugeConfig contract</a>
      </details>
    </div>
  );
}

/** Farming progress: live PatronVault totalDeposits vs NEXT_PUBLIC_FARMING_TARGET (provisional). */
export function FarmingGauge() {
  const [tvl, setTvl] = useState<number | null>(null);
  useEffect(() => {
    const load = () => V.pub.readContract({ address: V.VAULT, abi: V.vaultAbi, functionName: "totalDeposits" }).then((x) => setTvl(Number(formatEther(x as bigint)))).catch(() => {});
    load(); const i = setInterval(load, 15000); return () => clearInterval(i);
  }, []);
  const pct = tvl == null ? 0 : Math.min(100, (tvl / FARM_TARGET) * 100);
  const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <Link href="/vault/" className="dm-g">
      <div className="dm-h"><span>Farming progress</span><b>{tvl == null ? "—" : pct.toFixed(2) + "%"}</b></div>
      <div className="dm-bar"><i style={{ width: `${pct}%` }} /></div>
      <small>{tvl == null ? "Loading…" : f(tvl)} PAT farming / {f(FARM_TARGET)} PAT <em>target (provisional)</em> · Deposit →</small>
    </Link>
  );
}
