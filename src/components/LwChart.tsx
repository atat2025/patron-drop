"use client";
import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/types";

/** Light TradingView-style chart: pinch to zoom, one-finger drag to pan (chart only). */
export default function LwChart({ candles, resetKey }: { candles: Candle[]; resetKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vs = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastKey = useRef("");
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#fffdf7" }, textColor: "#333", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#f0ece2" }, horzLines: { color: "#f0ece2" } },
      rightPriceScale: { borderColor: "#e6e2d8" },
      timeScale: { borderColor: "#e6e2d8", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      crosshair: { mode: 0 },
      localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) },
    });
    cs.current = c.addSeries(CandlestickSeries, { upColor: "#3aa0ff", borderUpColor: "#3aa0ff", wickUpColor: "#3aa0ff", downColor: "#ff0047", borderDownColor: "#ff0047", wickDownColor: "#ff0047" });
    vs.current = c.addSeries(HistogramSeries, { color: "rgba(0,0,0,.12)", priceFormat: { type: "volume" }, priceScaleId: "" });
    vs.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    return () => { c.remove(); chart.current = null; };
  }, []);
  useEffect(() => {
    if (!cs.current || !vs.current) return;
    const seen = new Set<number>();
    const d = candles.map((x) => ({ ...x, s: Math.floor(x.t / 1000) as UTCTimestamp })).filter((x) => !seen.has(x.s) && seen.add(x.s)).sort((a, b) => a.s - b.s);
    cs.current.setData(d.map((x) => ({ time: x.s, open: x.o, high: x.h, low: x.l, close: x.c })));
    vs.current.setData(d.map((x) => ({ time: x.s, value: x.v ?? 0, color: x.c >= x.o ? "rgba(58,160,255,.3)" : "rgba(255,0,71,.3)" })));
    if (lastKey.current !== resetKey && d.length) { lastKey.current = resetKey; chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, d.length - 80), to: d.length + 3 }); }
  }, [candles, resetKey]);
  return <div ref={el} className="ux-lw" style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
