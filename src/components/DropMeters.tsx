"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import * as V from "@/lib/vaultChain";

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
