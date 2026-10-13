"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import * as V from "@/lib/vaultChain";
import { readGauge, yen, SEI_JPY, GAUGE, type GaugeData } from "@/lib/gauge";

const TARGET = process.env.NEXT_PUBLIC_COUNTDOWN_TARGET || "2026-11-30T00:00:00+09:00";
const LABEL = process.env.NEXT_PUBLIC_COUNTDOWN_LABEL || "Listing in";
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

/** Staged liquidity goal (JPY). On-chain value and operator-added value are shown as separate, labeled segments. */
export function LiquidityGauge() {
  const [d, setD] = useState<GaugeData | null>(null);
  useEffect(() => { const load = () => readGauge().then(setD).catch(() => {}); load(); const i = setInterval(load, 20000); return () => clearInterval(i); }, []);
  if (!d) return <div className="dm-g"><div className="dm-h"><span>流動性ゴール / Liquidity goal</span></div><small>Loading…</small></div>;
  const total = d.onchainJPY + d.manualJPY;
  const reached = d.stages.filter((s) => total >= s).length;
  const next = d.stages[reached];
  const prev = reached ? d.stages[reached - 1] : 0;
  const scale = next ?? d.stages[d.stages.length - 1];
  const pctNext = next ? Math.min(100, ((total - prev) / (next - prev)) * 100) : 100;
  const w = (x: number) => `${Math.min(100, (x / scale) * 100)}%`;
  return (
    <div className="dm-g">
      <div className="dm-h"><span>流動性ゴール · {next ? `Stage ${reached + 1}` : "All stages reached"}</span><b>{next ? `${pctNext.toFixed(1)}% to next` : "100%"}</b></div>
      <div className="dm-bar dm-seg">
        <i className="on" style={{ width: w(d.onchainJPY) }} title="On-chain" />
        <i className="op" style={{ width: w(d.manualJPY) }} title="運営による追加分" />
        {d.stages.map((s, k) => s <= scale && <span key={k} className="dm-tick" style={{ left: w(s) }} />)}
      </div>
      <div className="dm-leg">
        <div><i className="on" />オンチェーン（Vault TVL）<b>{yen(d.onchainJPY)}</b></div>
        <div><i className="op" />運営による追加分<b>{yen(d.manualJPY)}</b></div>
        {d.note && <p className="dm-note">運営メモ: {d.note}</p>}
        <div className="dm-tot">合計 <b>{yen(total)}</b>{next && <> / 次のステージ {yen(next)}</>}</div>
      </div>
      <div className="dm-stages">{d.stages.map((s, k) => <span key={k} className={total >= s ? "ok" : ""}>Stage {k + 1}: {yen(s)}</span>)}</div>
      <small>On-chain: {d.tvlPAT.toLocaleString("en-US", { maximumFractionDigits: 2 })} PAT in <Link href="/vault/">PatronVault</Link> × PAT {d.patSEI.toPrecision(3)} SEI (PatronLaunch) × SEI/JPY {SEI_JPY} <em>（仮）</em>. Sei testnet.</small>
      <details className="dm-hist"><summary>変更履歴 / Change history ({d.history.length})</summary>
        {d.history.length ? d.history.map((h, k) => <div key={k}><span>{new Date(h.at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</span>{h.kind === 1 ? <b>運営追加分 → {yen(h.amountJPY)}{h.note && ` (${h.note})`}</b> : <b>ステージ → {h.stages.map(yen).join(" / ")}</b>}</div>) : <p>No changes</p>}
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
      <small>{tvl == null ? "Loading…" : f(tvl)} PAT farming / {f(FARM_TARGET)} PAT <em>target（仮）</em> · Deposit →</small>
    </Link>
  );
}
