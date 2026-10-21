"use client";
import { useEffect, useState } from "react";
/** Buying / depositing requires accepting the terms (stored in this browser). */
const KEY = "patron-terms-v1";
let ok = false; const subs = new Set<() => void>();
if (typeof window !== "undefined") { try { ok = localStorage.getItem(KEY) === "1"; } catch {} }
export const isConfirmed = () => ok;
function set(v: boolean) { ok = v; try { v ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch {} subs.forEach((f) => f()); }
export function useResidency() {
  const [, r] = useState(0);
  useEffect(() => { const f = () => r((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return ok;
}
export function ResidencyCheck() {
  const v = useResidency();
  return <label className="pd-fine pd-chk"><input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> I understand this is new and risky, it is not financial advice, and I could lose all the money I put in.</label>;
}
