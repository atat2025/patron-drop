import type { Candle } from "./types";

/** Percentile of a pre-sorted ascending array. */
function pct(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo]! : sorted[lo]! * (hi - i) + sorted[hi]! * (i - lo);
}

/**
 * Clip Monaco fat-finger / illiquid prints so chart autoscaling stays readable.
 * - Drops candles whose open AND close are extreme vs the close distribution
 * - Winsorizes wicks to a robust band around closes (p1–p99 expanded)
 * Does not invent prices: only clips outliers already in the feed.
 */
export function sanitizeCandles(cs: Candle[]): Candle[] {
  if (cs.length < 3) return cs;
  const closes = cs.map((c) => c.c).filter((x) => x > 0).sort((a, b) => a - b);
  if (closes.length < 3) return cs;

  const med = pct(closes, 0.5);
  if (!(med > 0)) return cs;
  const p01 = pct(closes, 0.01);
  const p99 = pct(closes, 0.99);
  // Soft band from close distribution; keep at least ±12% of median for quiet books.
  let loBound = Math.min(p01, med * 0.88);
  let hiBound = Math.max(p99, med * 1.12);
  // Expand 15% so real swings near the edges still show wicks.
  loBound = Math.max(0, loBound * 0.85);
  hiBound = hiBound * 1.15;
  // Absolute sanity vs median (blocks 7× spikes without killing multi-month trends inside p01–p99).
  loBound = Math.max(loBound, med * 0.25);
  hiBound = Math.min(hiBound, med * 4);

  // Median true-range → wick budget relative to body.
  const trs = cs
    .map((c, i) => {
      const prev = i ? cs[i - 1]!.c : c.o;
      return Math.max(c.h - c.l, Math.abs(c.h - prev), Math.abs(c.l - prev));
    })
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const medTR = trs.length ? pct(trs, 0.5) : med * 0.02;

  const out: Candle[] = [];
  let prev = med;
  for (const c of cs) {
    let o = c.o, cl = c.c, h = c.h, l = c.l;
    const bodyExtreme = (x: number) =>
      x <= 0 || x > hiBound * 1.05 || x < loBound * 0.95 || (Math.abs(x - med) / med > 0.55 && Math.abs(x - prev) / Math.max(prev, 1e-12) > 0.45);

    if (bodyExtreme(o) && bodyExtreme(cl)) continue; // drop absurd print bar
    if (bodyExtreme(o)) o = prev;
    if (bodyExtreme(cl)) cl = prev;

    const bodyHi = Math.max(o, cl);
    const bodyLo = Math.min(o, cl);
    const mid = (bodyHi + bodyLo) / 2 || med;
    // Wick may extend a bit past the body, but not past the robust band or a TR budget.
    const budget = Math.min(mid * 0.35, Math.max(mid * 0.06, medTR * 4));
    h = Math.min(Math.max(h, bodyHi), Math.min(hiBound, bodyHi + budget));
    l = Math.max(Math.min(l, bodyLo), Math.max(loBound, bodyLo - budget));
    // Keep OHLC consistency.
    h = Math.max(h, bodyHi);
    l = Math.min(l, bodyLo);
    if (!(h >= l && o > 0 && cl > 0)) continue;
    out.push({ t: c.t, o, h, l, c: cl, v: c.v });
    prev = cl;
  }
  return out.length >= Math.min(3, cs.length) ? out : cs;
}

/** True when raw Monaco candles have wild wicks that would flatten autoscaling. */
export function candlesNoisy(cs: Candle[]): boolean {
  if (cs.length < 8) return false;
  const closes = cs.map((c) => c.c).filter((x) => x > 0).sort((a, b) => a - b);
  const med = pct(closes, 0.5);
  if (!(med > 0)) return false;
  const maxH = Math.max(...cs.map((c) => c.h));
  const minL = Math.min(...cs.map((c) => c.l).filter((x) => x > 0));
  return maxH > med * 2.5 || minL < med * 0.4;
}

/** Clamp 24h high/low so header stats match a readable chart. */
export function sanitizeStatsRange(high: number, low: number, ref: number): { high: number; low: number } {
  if (!(ref > 0)) return { high, low };
  const hiCap = ref * 1.35;
  const loCap = ref * 0.65;
  let h = Number.isFinite(high) && high > 0 ? Math.min(high, hiCap) : ref;
  let l = Number.isFinite(low) && low > 0 ? Math.max(low, loCap) : ref;
  if (h < ref) h = Math.max(h, ref);
  if (l > ref) l = Math.min(l, ref);
  if (l > h) return { high: ref, low: ref };
  return { high: h, low: l };
}

/** Robust price range for chart autoscaling (p2–p98 of highs/lows, padded). */
export function robustPriceRange(cs: Candle[]): { min: number; max: number } | null {
  if (cs.length < 3) return null;
  const samples: number[] = [];
  for (const c of cs) {
    if (c.h > 0) samples.push(c.h);
    if (c.l > 0) samples.push(c.l);
    if (c.c > 0) samples.push(c.c);
  }
  samples.sort((a, b) => a - b);
  if (samples.length < 3) return null;
  const min = pct(samples, 0.02);
  const max = pct(samples, 0.98);
  if (!(max > min && min > 0)) {
    const med = pct(samples, 0.5);
    return { min: med * 0.97, max: med * 1.03 };
  }
  const pad = (max - min) * 0.08 || max * 0.01;
  return { min: Math.max(0, min - pad), max: max + pad };
}
