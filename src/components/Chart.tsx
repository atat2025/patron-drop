"use client";
import { useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/types";
import { sanitizeCandles, robustPriceRange } from "@/lib/candleSanitize";

const fmtAxis = (n: number) => (n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toFixed(4));

export default function Chart({ candles, mode = "line" }: { candles: Candle[]; mode?: "line" | "candle" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 400 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{size.w < 80 ? null : candles.length ? (mode === "candle" ? <CandleSvg candles={candles} W={size.w} H={size.h} /> : <Svg candles={candles} W={size.w} H={size.h} />) : <div className="empty">No chart data</div>}</div>;
}

function Svg({ candles, W, H }: { candles: Candle[]; W: number; H: number }) {
  const PR = 76, PT = 14, PB = 22;
  const hi = Math.max(...candles.map((c) => c.c)), lo = Math.min(...candles.map((c) => c.c));
  const pad = (hi - lo) * 0.12 || hi * 0.01;
  const top = hi + pad, bot = lo - pad;
  const y = (v: number) => PT + (1 - (v - bot) / (top - bot)) * (H - PT - PB);
  const n = candles.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * (W - PR - 14) : 0);
  const last = candles[n - 1];
  const ticks = Array.from({ length: 4 }, (_, i) => bot + ((top - bot) * (i + 0.5)) / 4);
  const line = candles.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c.c).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1).toFixed(1)},${H - PB}L0,${H - PB}Z`;
  const times = [0.15, 0.4, 0.65, 0.9].map((f) => Math.floor(f * (n - 1)));
  const tfmt = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
      <defs><linearGradient id="paperfill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ink)" stopOpacity="0.12" /><stop offset="1" stopColor="var(--ink)" stopOpacity="0.02" /></linearGradient></defs>
      <line x1={W - PR} x2={W - PR} y1={0} y2={H} stroke="var(--line-2)" />
      {ticks.filter((t) => Math.abs(y(t) - y(last.c)) > 16).map((t) => (
        <g key={t}>
          <line x1={0} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--line-2)" strokeDasharray="4 4" />
          <text x={W - PR + 8} y={y(t) + 4} fill="var(--muted)" fontSize="11" fontFamily="var(--display)">{fmtAxis(t)}</text>
        </g>
      ))}
      <line x1={0} x2={W - PR} y1={H - PB} y2={H - PB} stroke="var(--line-2)" strokeDasharray="4 4" />
      {times.map((i) => <text key={i} x={x(i)} y={H - 6} fill="var(--muted)" fontSize="10" textAnchor="middle" fontFamily="var(--display)">{tfmt(candles[i].t)}</text>)}
      <path d={area} fill="url(#paperfill)" />
      <path d={line} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" />
      <line x1={x(n - 1)} x2={W - PR} y1={y(last.c)} y2={y(last.c)} stroke="var(--ink)" strokeDasharray="2 3" opacity={0.5} />
      <circle cx={x(n - 1)} cy={y(last.c)} r={4} fill="var(--ink)" />
      <rect x={W - PR + 2} y={y(last.c) - 10} width={PR - 4} height={20} rx={2} fill="var(--ink)" />
      <text x={W - PR + 7} y={y(last.c) + 4} fill="var(--panel)" fontSize="11" fontWeight={700} fontFamily="var(--display)">{fmtAxis(last.c)}</text>
    </svg>
  );
}

function CandleSvg({ candles: all, W, H }: { candles: Candle[]; W: number; H: number }) {
  const candles = sanitizeCandles(all).slice(-60);
  const PR = 64, PT = 10, PB = 20, VH = H * 0.16;
  const rr = robustPriceRange(candles);
  const hi = rr ? rr.max : Math.max(...candles.map((c) => c.h)), lo = rr ? rr.min : Math.min(...candles.map((c) => c.l));
  const pad = (hi - lo) * 0.08 || hi * 0.01;
  const top = hi + pad, bot = Math.max(0, lo - pad);
  const ch = H - PT - PB - VH;
  const y = (v: number) => PT + (1 - (v - bot) / (top - bot)) * ch;
  const n = candles.length, w = (W - PR - 6) / n;
  const vmax = Math.max(1e-9, ...candles.map((c) => c.v ?? 0));
  const last = candles[n - 1];
  const ticks = Array.from({ length: 4 }, (_, i) => bot + ((top - bot) * (i + 0.5)) / 4);
  const times = [0.1, 0.37, 0.63, 0.9].map((f) => Math.floor(f * (n - 1)));
  const span = n > 1 ? candles[n - 1].t - candles[0].t : 0;
  const tfmt = (t: number) => span > 3 * 86_400_000 ? new Date(t).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
      {ticks.filter((t) => Math.abs(y(t) - y(last.c)) > 14).map((t) => (
        <g key={t}><line x1={0} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--line-2)" strokeDasharray="4 4" />
          <text x={W - PR + 6} y={y(t) + 4} fill="var(--muted)" fontSize="10" fontFamily="var(--display)">{fmtAxis(t)}</text></g>
      ))}
      {candles.map((c, i) => {
        const up = c.c >= c.o, x = i * w + w / 2, col = up ? "var(--long)" : "var(--short)";
        const vh = ((c.v ?? 0) / vmax) * VH;
        return (<g key={c.t}>
          <rect x={x - w * 0.35} width={w * 0.7} y={H - PB - vh} height={vh} fill="var(--ink)" opacity={0.12} />
          <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} />
          <rect x={x - w * 0.32} width={w * 0.64} y={y(Math.max(c.o, c.c))} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={up ? "var(--panel)" : col} stroke={col} strokeWidth={1} />
        </g>);
      })}
      {times.map((i) => <text key={i} x={i * w + w / 2} y={H - 5} fill="var(--muted)" fontSize="10" textAnchor="middle" fontFamily="var(--display)">{tfmt(candles[i].t)}</text>)}
      <line x1={0} x2={W - PR} y1={y(last.c)} y2={y(last.c)} stroke="var(--red)" strokeDasharray="2 3" />
      <rect x={W - PR + 2} y={y(last.c) - 10} width={PR - 4} height={20} rx={2} fill="var(--ink)" />
      <text x={W - PR + 6} y={y(last.c) + 4} fill="var(--panel)" fontSize="10.5" fontWeight={700} fontFamily="var(--display)">{fmtAxis(last.c)}</text>
    </svg>
  );
}
