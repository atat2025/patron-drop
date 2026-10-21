"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/types";

/** Light TradingView-style chart: pinch to zoom, one-finger drag to pan (chart only). */
export default function LwChart({ candles, resetKey }: { candles: Candle[]; resetKey: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const vs = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastKey = useRef("");
  const [auto, setAuto] = useState(true);
  const reset = () => { cs.current?.priceScale().setAutoScale(true); setAuto(true); };
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#fffdf7" }, textColor: "#333", fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: "#f0ece2" }, horzLines: { color: "#f0ece2" } },
      rightPriceScale: { borderColor: "#e6e2d8" },
      timeScale: { borderColor: "#e6e2d8", timeVisible: true, secondsVisible: false, rightOffset: 4 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
      crosshair: { mode: 0 },
      localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) },
    });
    cs.current = c.addSeries(CandlestickSeries, { upColor: "#3aa0ff", borderUpColor: "#3aa0ff", wickUpColor: "#3aa0ff", downColor: "#ff0047", borderDownColor: "#ff0047", wickDownColor: "#ff0047" });
    vs.current = c.addSeries(HistogramSeries, { color: "rgba(0,0,0,.12)", priceFormat: { type: "volume" }, priceScaleId: "", lastValueVisible: false, priceLineVisible: false });
    vs.current.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chart.current = c;
    const theme = () => {
      const d = document.documentElement.getAttribute("data-theme") === "dark";
      c.applyOptions({ layout: { background: { type: ColorType.Solid, color: d ? "#10151e" : "#fffdf7" }, textColor: d ? "#a6adb7" : "#333" },
        grid: { vertLines: { color: d ? "#1c2230" : "#f0ece2" }, horzLines: { color: d ? "#1c2230" : "#f0ece2" } },
        rightPriceScale: { borderColor: d ? "#30343b" : "#e6e2d8" }, timeScale: { borderColor: d ? "#30343b" : "#e6e2d8" } });
    };
    theme();
    const mo = new MutationObserver(theme); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const ps = () => cs.current!.priceScale();
    // Track manual price-axis changes (axis drag / vertical drag) -> show "Auto" as off.
    const sync = () => setAuto(ps().options().autoScale);
    const box = el.current;
    // Two-finger vertical pinch = price zoom (lightweight-charts pinch only zooms time).
    let p0: { dy: number; from: number; to: number; mid: number } | null = null;
    const ts = (e: TouchEvent) => {
      if (e.touches.length !== 2) { p0 = null; return; }
      const [a, b] = [e.touches[0], e.touches[1]];
      const dy = Math.abs(a.clientY - b.clientY), dx = Math.abs(a.clientX - b.clientX);
      const r = ps().getVisibleRange();
      if (dy > dx && dy > 30 && r) {
        const rect = box.getBoundingClientRect();
        const y = (a.clientY + b.clientY) / 2 - rect.top;
        const mid = cs.current!.coordinateToPrice(y) ?? (r.from + r.to) / 2;
        p0 = { dy, from: r.from, to: r.to, mid: Number(mid) };
        e.stopPropagation(); e.preventDefault();
      } else p0 = null;
    };
    const tm = (e: TouchEvent) => {
      if (!p0 || e.touches.length !== 2) return;
      e.stopPropagation(); e.preventDefault();
      const dy = Math.max(10, Math.abs(e.touches[0].clientY - e.touches[1].clientY));
      const k = Math.min(20, Math.max(0.05, p0.dy / dy));
      ps().setAutoScale(false);
      ps().setVisibleRange({ from: p0.mid - (p0.mid - p0.from) * k, to: p0.mid + (p0.to - p0.mid) * k });
      setAuto(false);
    };
    const te = (e: TouchEvent) => { if (e.touches.length < 2) p0 = null; setTimeout(sync, 0); };
    box.addEventListener("touchstart", ts, { capture: true, passive: false });
    box.addEventListener("touchmove", tm, { capture: true, passive: false });
    box.addEventListener("touchend", te, { capture: true });
    box.addEventListener("mouseup", te as unknown as EventListener);
    return () => { box.removeEventListener("touchstart", ts, true); box.removeEventListener("touchmove", tm, true); box.removeEventListener("touchend", te, true); box.removeEventListener("mouseup", te as unknown as EventListener); mo.disconnect(); c.remove(); chart.current = null; };
  }, []);
  useEffect(() => {
    if (!cs.current || !vs.current) return;
    const seen = new Set<number>();
    const d = candles.map((x) => ({ ...x, s: Math.floor(x.t / 1000) as UTCTimestamp })).filter((x) => !seen.has(x.s) && seen.add(x.s)).sort((a, b) => a.s - b.s);
    cs.current.setData(d.map((x) => ({ time: x.s, open: x.o, high: x.h, low: x.l, close: x.c })));
    vs.current.setData(d.map((x) => ({ time: x.s, value: x.v ?? 0, color: x.c >= x.o ? "rgba(58,160,255,.3)" : "rgba(255,0,71,.3)" })));
    if (lastKey.current !== resetKey && d.length) { lastKey.current = resetKey; cs.current.priceScale().setAutoScale(true); setAuto(true); chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, d.length - 80), to: d.length + 3 }); }
  }, [candles, resetKey]);
  return (
    <div className="ux-lwwrap">
      <button className={"ux-auto" + (auto ? " on" : "")} onClick={reset} aria-label="Reset price zoom">Auto</button>
      <div ref={el} className="ux-lw" style={{ width: "100%", height: "100%", touchAction: "none" }} />
    </div>
  );
}
