"use client";
import { useEffect, useState } from "react";
/** Live SEI/USD (CoinGecko simple price), cached in localStorage; falls back to the last cached / default value. */
const KEY = "patron-sei-usd";
const DEFAULT = Number(process.env.NEXT_PUBLIC_SEI_USD_FALLBACK || "0.065");
let usd = DEFAULT, src: "live" | "cache" | "default" = "default";
const subs = new Set<() => void>();
if (typeof window !== "undefined") { try { const c = JSON.parse(localStorage.getItem(KEY) || "null"); if (c?.p > 0) { usd = c.p; src = "cache"; } } catch {} }
let started = false;
async function load() {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=sei-network&vs_currencies=usd");
    const p = (await r.json())?.["sei-network"]?.usd;
    if (p > 0) { usd = p; src = "live"; try { localStorage.setItem(KEY, JSON.stringify({ p, t: Date.now() })); } catch {} subs.forEach((f) => f()); }
  } catch {}
}
export function useSeiUsd() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); subs.add(f); if (!started) { started = true; load(); setInterval(load, 120000); } return () => { subs.delete(f); }; }, []);
  return { usd, src };
}
export const seiUsd = () => usd;
export const fmtUsd = (u: number) => !isFinite(u) ? "—" : "$" + (Math.abs(u) >= 1 ? u.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : u.toLocaleString("en-US", { maximumSignificantDigits: 3 }));
export const fmtSei = (s: number) => s.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " SEI";
/** "$2.05 (31.73 SEI)" */
export const usdSei = (s: number) => !isFinite(s) ? "—" : `${fmtUsd(s * usd)} (${fmtSei(s)})`;
