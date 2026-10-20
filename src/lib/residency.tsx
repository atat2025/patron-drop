"use client";
import { useEffect, useState } from "react";
/** Overseas-only release: buying / depositing requires confirming non-Japan residency + terms (stored in this browser). */
const KEY = "patron-not-jp-v1";
let ok = false; const subs = new Set<() => void>();
if (typeof window !== "undefined") { try { ok = localStorage.getItem(KEY) === "1"; } catch {} }
export const isConfirmed = () => ok;
function set(v: boolean) { ok = v; try { v ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {} subs.forEach((f) => f()); }
export function useResidency() {
  const [, r] = useState(0);
  useEffect(() => { const f = () => r((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return ok;
}
export function JapanNotice() {
  return <div className="pd-jp" role="note"><b>Not available to residents of Japan.</b> PATRON is offered only outside Japan. Do not buy or deposit if you live in Japan.</div>;
}
export function ResidencyCheck() {
  const v = useResidency();
  const [tzJp, setTzJp] = useState(false);
  useEffect(() => { try { setTzJp(Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tokyo"); } catch {} }, []);
  return <label className="pd-fine pd-chk"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> I confirm that I am not a resident of Japan and I accept the terms: this is an experimental token and vault, not investment advice, and I may lose the full amount.{tzJp && <em> Your device is set to Japan time.</em>}</label>;
}
