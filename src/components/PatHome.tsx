"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import Mustache from "./Mustache";
import PatCurvePage from "./PatCurve";
import { Art, StakeSection } from "./PatronDrop";
import { Countdown, LiquidityGauge } from "./DropMeters";
import * as P from "@/lib/patCurve";
import { connect, switchTo } from "@/lib/bridge";
import { useSeiUsd, fmtUsd } from "@/lib/seiUsd";

/** Mainnet home: the original PATRON home layout, wired to Sei mainnet PatCurve (chain 1329). */
const EXT = process.env.NEXT_PUBLIC_HOME_URL || "https://patron.red";
const num = (v?: bigint, d = 0) => (v === undefined ? "…" : Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: d }));

export default function PatHome() {
  const { usd } = useSeiUsd();
  const [st, setSt] = useState<Awaited<ReturnType<typeof P.readCurve>> | undefined>(() => {
    const c = P.cachedCurve();
    return c ? { inv: c.inv, sold: c.sold, backing: c.backing, price: c.price, paused: c.paused } : undefined;
  });
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint>();
  const [mode, setMode] = useState<null | "buy" | "sell" | "stats">(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setSt(await P.readCurve()); setErr(null); } catch (e) { setErr("Can't read the price right now: " + (e as Error).message.split("\n")[0]); }
    if (me) try { setBal(await P.patBalance(me)); } catch {}
  }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  const doConnect = async () => { try { const a = await connect(); await switchTo("sei"); setMe(a); } catch (e) { setErr((e as Error).message.split("\n")[0]); } };
  const price = st ? Number(formatEther(st.price)) : undefined;
  const Px = ({ v }: { v?: number }) => v === undefined || !usd ? <>…</> : <>{fmtUsd(v * usd)}<small className="pd-sei"> ({v.toLocaleString("en-US", { maximumFractionDigits: 6 })} SEI)</small></>;

  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={EXT}><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">SEI</span>
          <button className="pd-wallet" onClick={doConnect}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect Wallet"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>PATRON</h1><p>$PAT</p></div>
          <Art />
          <div className="pd-card-f">
            <div><b><Px v={price} /></b><small>{num(st?.inv)} PAT available</small></div>
            <button className="pd-stats" onClick={() => setMode("stats")}><em>How the price works</em><span>?</span></button>
          </div>
        </section>
        <Countdown />
        <LiquidityGauge />
        <div className="pd-info">Buy and sell PATRON on Sei. The price goes up a little with every buy. <a onClick={() => setMode("stats")}>Learn more</a>
          {me && <div className="pd-bal">You hold <b>{num(bal, 2)}</b> PAT</div>}
          <div className="pd-net">Sei · 1329 · <a href={`https://seiscan.io/address/${P.CURVE}`} target="_blank" rel="noreferrer">contract</a> · <a onClick={() => switchTo("sei").catch((e) => setErr((e as Error).message))}>Add Sei</a></div>
          {err && <div className="pd-err">{err}</div>}
        </div>
        <button className="pd-buy" onClick={() => setMode("buy")}>Buy</button>
        <div className="pd-row">
          <button className="pd-sec" onClick={() => setMode("sell")}>Sell</button>
          <a className="pd-sec" href="bridge/" style={{ textAlign: "center" }}>Bridge</a>
        </div>
        <PriceSection price={price} usd={usd} st={st} />
        <StakeSection held={bal ? Math.floor(Number(formatEther(bal))) : 0} />
        <a className="pd-sec pd-link" href="vault/">Automated trading →</a>
        <p className="pd-foot"><a href={EXT} target="_blank" rel="noreferrer">patron.red →</a></p>
      </main>
      {mode && <div className="pd-ov" onClick={() => setMode(null)}>
        <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
          {(mode === "buy" || mode === "sell") && <PatCurvePage panel start={mode} onDone={load} />}
          {mode === "stats" && <div className="pd-mbody"><div className="pd-mh dark">How the price works</div>
            <PriceSection price={price} usd={usd} st={st} curveOnly />
            <small className="pd-fine">Each buy raises the price a little; each sell lowers it. The money buyers pay stays in the contract so sellers can always be paid.</small>
            <dl className="pd-dl"><dt>Price now</dt><dd><Px v={price} /></dd><dt>Sold so far</dt><dd>{num(st?.sold)} PAT</dd><dt>Still available</dt><dd>{num(st?.inv)} PAT</dd><dt>Money held</dt><dd>{st && usd ? fmtUsd(Number(formatEther(st.backing)) * usd) : "…"}</dd></dl></div>}
        </div>
      </div>}
    </div>
  );
}

function PriceSection({ price, usd, st, curveOnly }: { price?: number; usd: number; st?: Awaited<ReturnType<typeof P.readCurve>>; curveOnly?: boolean }) {
  const cached = P.cachedCurve();
  const [view, setView] = useState<"history" | "curve">(curveOnly ? "curve" : "curve");
  const [fills, setFills] = useState<P.PatFill[] | null>(null);
  const [cp, setCp] = useState<{ p0: number; slope: number } | undefined>(() =>
    cached && cached.slope > 0 ? { p0: cached.p0, slope: cached.slope } : undefined);
  useEffect(() => {
    P.curveParams().then(setCp).catch(() => {});
    if (!curveOnly) {
      let alive = true;
      const to = setTimeout(() => { if (alive) setFills((f) => f === null ? [] : f); }, 7000);
      P.fills().then((f) => { if (alive) setFills(f); }).catch(() => { if (alive) setFills([]); });
      return () => { alive = false; clearTimeout(to); };
    }
  }, [curveOnly]);
  const sold = st ? Number(formatEther(st.sold)) : (cached ? Number(formatEther(cached.sold)) : 0);
  const inv = st ? Number(formatEther(st.inv)) : (cached ? Number(formatEther(cached.inv)) : 0);
  const total = sold + inv;
  const livePrice = price ?? (st ? Number(formatEther(st.price)) : cached ? Number(formatEther(cached.price)) : undefined);
  const hist = fills && fills.length && livePrice ? [...fills.map((f) => f.price), livePrice] : [];
  const useHist = view === "history" && hist.length >= 2;
  // Bonding-curve shape: price rises as more PAT is sold (FOMO). Uses real on-chain p0/slope.
  const curvePts = cp && total > 0 ? Array.from({ length: 49 }, (_, i) => cp.p0 + cp.slope * (total * i / 48)) : [];
  const ys = useHist ? hist : curvePts;
  const W = 320, H = 150;
  const u = (v: number) => fmtUsd(v * (usd || 0.05));
  const showPrice = livePrice !== undefined;
  if (ys.length < 2) {
    // Still show the live/cached price immediately; never a blank Loading-only card.
    return (
      <section className={curveOnly ? "" : "pd-panel"}>
        {!curveOnly && <div className="pd-ph"><b>Price</b>
          <div className="pd-tabs"><button className={view === "history" ? "on" : ""} onClick={() => setView("history")}>History</button><button className={view === "curve" ? "on" : ""} onClick={() => setView("curve")}>Curve</button></div></div>}
        {!curveOnly && <div className="pd-pbig">{showPrice && usd ? u(livePrice!) : showPrice ? `${livePrice!.toLocaleString("en-US", { maximumSignificantDigits: 4 })} SEI` : "…"}<small> per PAT now</small></div>}
        <small className="pd-fine">{cp ? "Building curve…" : "Fetching curve…"}</small>
      </section>
    );
  }
  const mn = Math.min(...ys), mx = Math.max(...ys), r = mx - mn || mn * 0.02 || 1e-6;
  // Pad Y so a shallow rise still looks like a climb (never a dead flat line).
  const y0 = mn - r * 0.15, y1 = mx + r * 0.1, rr = y1 - y0;
  const X = (i: number) => (i / (ys.length - 1)) * W, Y = (v: number) => H - 8 - ((v - y0) / rr) * (H - 16);
  const d = "M" + ys.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" L");
  const mark = useHist ? ys.length - 1 : total ? Math.min(48, (sold / total) * 48) : 0;
  const markY = useHist ? livePrice! : (cp!.p0 + cp!.slope * sold);
  // Map real fills onto the curve X by approximating sold-progress from price.
  const fillDots = (!useHist && fills && cp && cp.slope > 0) ? fills.slice(-12).map((f) => {
    const sApprox = Math.max(0, Math.min(total, (f.price - cp.p0) / cp.slope));
    const xi = total ? (sApprox / total) * 48 : 0;
    return { x: X(xi), y: Y(f.price), side: f.side, tx: f.tx };
  }) : [];
  return (
    <section className={curveOnly ? "" : "pd-panel"}>
      {!curveOnly && <div className="pd-ph"><b>Price</b>
        <div className="pd-tabs"><button className={view === "history" ? "on" : ""} onClick={() => setView("history")}>History</button><button className={view === "curve" ? "on" : ""} onClick={() => setView("curve")}>Curve</button></div></div>}
      {!curveOnly && <div className="pd-pbig">{showPrice && usd ? u(livePrice!) : showPrice ? `${livePrice!.toLocaleString("en-US", { maximumSignificantDigits: 4 })} SEI` : "…"}<small> per PAT now</small></div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="pd-chart">
        <path d={d + ` L${W},${H} L0,${H}Z`} fill="var(--pd-red)" opacity=".08" />
        <path d={d} fill="none" stroke="var(--pd-red)" strokeWidth="2" />
        {fillDots.map((dot) => (
          <circle key={dot.tx + dot.side} cx={dot.x} cy={dot.y} r="3.5" fill={dot.side === "BUY" ? "var(--pd-red)" : "#888"} opacity=".85" />
        ))}
        <circle cx={X(mark)} cy={Y(markY)} r="5" fill="var(--pd-red)" />
        {usd > 0 && <><text x="2" y="10" fontSize="9" fill="#888">{u(y1)}</text><text x="2" y={H - 2} fontSize="9" fill="#888">{u(y0)}</text></>}
      </svg>
      {!curveOnly && <small className="pd-fine">{useHist ? `${fills!.length} recent buys and sells` : fills === null ? "Curve · refreshing trades…" : fills.length ? `Bonding curve · ${fills.length} recent trade${fills.length === 1 ? "" : "s"} marked` : "Price rises as more PAT is sold. Dot = now."}</small>}
      {!curveOnly && !!fills?.length && <div className="pd-fills">{fills.slice(-4).reverse().map((f) => (
        <a key={f.tx + f.side} href={`https://seiscan.io/tx/${f.tx}`} target="_blank" rel="noreferrer"><span className={f.side === "BUY" ? "b" : "s"}>{f.side === "BUY" ? "Buy" : "Sell"} {f.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span><span>{u(f.price)} each ↗</span></a>))}</div>}
    </section>
  );
}
