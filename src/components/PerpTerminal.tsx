"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import LwChart from "./LwChart";
import { logoOf, matches, NAMES } from "@/lib/marketMeta";
import { loadMarketsByType, loadBookMode, loadCandles, enrichMarkets, loadLiveTrades, connectWallet, loadStats, loadPositions, candleSource } from "@/lib/monaco";
import { config } from "@/lib/config";
import type { Book, Candle, Market, PositionRow, Stats, TradeRow } from "@/lib/types";

const TFS = ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as const;
type TF = (typeof TFS)[number];
const TFN: Record<string, string> = { "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W", "1M": "1M" };
const TFL: Record<TF, string> = { "1m": "1-minute", "3m": "3-minute", "5m": "5-minute", "15m": "15-minute", "1h": "1-hour", "4h": "4-hour", "1d": "1-day", "1w": "1-week", "1M": "1-month" };
const LEVS = [1, 2, 3, 5, 10, 20, 25, 50];
const MAX_LEV = 50; // Monaco mainnet: maxLeverage 50 on every perp market
const fp = (x: number) => (!x ? "—" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(2) : x < 0.001 ? x.toExponential(3) : x.toFixed(5));
const fk = (x: number) => (!x ? "—" : x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(2) + "K" : x.toFixed(2));
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Logo({ base, size = 28 }: { base: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const src = logoOf(base);
  return src && !bad ? <img className="ux-logo" style={{ width: size, height: size }} src={src} alt="" onError={() => setBad(true)} /> : <i className="ux-logo ux-logo-f" style={{ width: size, height: size }}>{base.slice(0, 1)}</i>;
}

export default function PerpTerminal() {
  const canTrade = !!config.clientId;
  const [markets, setMarkets] = useState<Market[]>([]);
  const [live, setLive] = useState<boolean | undefined>();
  const [sel, setSel] = useState("");
  const [pick, setPick] = useState(false);
  const [q, setQ] = useState("");
  const [tf, setTf] = useState<TF>("5m");
  const [ctab, setCtab] = useState<"CHART" | "OVERVIEW" | "DATA">("CHART");
  const [rtab, setRtab] = useState<"BOOK" | "TRADES">("BOOK");
  const [btab, setBtab] = useState<"POS" | "OPEN" | "OHIST" | "THIST">("POS");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [book, setBook] = useState<Book | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pos, setPos] = useState<PositionRow[]>([]);
  const [addr, setAddr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; t: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  // order form
  const [margin, setMargin] = useState<"Cross" | "Isolated">("Cross");
  const [lev, setLev] = useState(10);
  const [otype, setOtype] = useState<"LIMIT" | "MARKET">("MARKET");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [pct, setPct] = useState(0);
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const avail = 0; // USDC margin available on Monaco (0 until trading opens / wallet funded)

  useEffect(() => {
    loadMarketsByType("MARGIN").then((r) => {
      setMarkets(r.markets); setLive(r.live);
      enrichMarkets(r.markets, (u) => setMarkets((ms) => ms.map((x) => (x.id === u.id ? u : x))));
    });
    const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t);
  }, []);
  const m = markets.find((x) => x.id === sel) ?? markets[0];

  useEffect(() => {
    if (!m) return; let on = true;
    const tick = async () => {
      const b = await loadBookMode(m, "MARGIN"); if (!on) return; setBook(b);
      const lt = await loadLiveTrades(m, "MARGIN"); if (on) setTrades(lt ?? []);
    };
    setCandles([]); setStats(null);
    loadCandles(m, tf).then((c) => { if (!on) return; setCandles(c); tick(); loadStats(m, c).then((s) => on && setStats(s)); });
    const ct = setInterval(() => loadCandles(m, tf).then((c) => on && setCandles(c)), 30000);
    const t = setInterval(tick, 5000); return () => { on = false; clearInterval(t); clearInterval(ct); };
  }, [m?.id, tf]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (addr && markets.length) loadPositions(markets).then(setPos).catch(() => {}); }, [addr, markets]);

  const flash = (ok: boolean, t: string) => { setToast({ ok, t }); setTimeout(() => setToast(null), 7000); };
  const connect = async () => { try { setAddr(await connectWallet()); flash(true, canTrade ? "Wallet connected" : "Wallet connected. Trading opens soon."); } catch (e) { flash(false, (e as Error).message.split("\n")[0]); } };
  const order = (side: "BUY" | "SELL") => { if (!addr) return connect(); flash(false, `${side === "BUY" ? "Buy / Long" : "Sell / Short"} — trading opens soon. Prices, chart and order book are live from Monaco.`); };

  const last = candles.at(-1)?.c || m?.price || 0;
  const px = otype === "LIMIT" && +price ? +price : last;
  const q0 = +qty || 0;
  const value = q0 * px, cost = value / lev;
  const liqL = q0 ? px * (1 - 1 / lev + 0.005) : 0, liqS = q0 ? px * (1 + 1 / lev - 0.005) : 0;
  const setP = (p: number) => { setPct(p); if (avail && px) setQty(((avail * lev * p) / 100 / px).toFixed(4)); };
  const chg = m?.change24h ?? 0;
  const maxSz = Math.max(1, ...(book ? [...book.bids, ...book.asks].map((l) => l.size) : [1]));
  const bidSum = book?.bids.reduce((a, l) => a + l.size, 0) ?? 0, askSum = book?.asks.reduce((a, l) => a + l.size, 0) ?? 0;
  const buyPct = bidSum + askSum ? Math.round((bidSum / (bidSum + askSum)) * 100) : 50;
  const cd = stats ? Math.max(0, stats.nextFunding - now) : 0;
  const cds = [3_600_000, 60_000, 1000].map((d, i) => String(Math.floor((cd / d) % (i ? 60 : 99))).padStart(2, "0")).join(":");
  const shown = useMemo(() => markets.filter((x) => matches(x.base, x.symbol, q)), [markets, q]);
  const cum = (ls: { price: number; size: number }[]) => { let s = 0; return ls.map((l) => (s += l.size * l.price)); };
  const askRows = (book?.asks ?? []).slice(0, 10), bidRows = (book?.bids ?? []).slice(0, 10);
  const askCum = cum(askRows), bidCum = cum(bidRows);
  const ticker = useRef<HTMLDivElement>(null);

  return (
    <div className="pd ux pt">
      <header className="pd-top">
        <Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link>
        <div className="pd-actions">
          <span className={"ux-pill " + (live ? "ok" : "")}>{live === undefined ? "Loading…" : live ? "Live · Monaco" : "Monaco unavailable"}</span>
          <button className="pd-wallet" onClick={connect}>{addr ? short(addr) : "Connect Wallet"}</button>
        </div>
      </header>

      {/* Market bar */}
      <div className="pt-bar">
        <button className="pt-mkt" onClick={() => setPick((v) => !v)} aria-expanded={pick}>
          {m && <Logo base={m.base} size={34} />}
          <span><b>{m ? m.symbol.replace("/", "") : "—"} ▾</b><small>Perpetual · {m ? (NAMES[m.base] ?? "").replace(/\s[^\x00-\x7F].*$/, "") : ""}</small></span>
        </button>
        <div className="pt-px"><b style={{ color: "#3aa0ff" }}>{fp(last)}</b><small>{fp(stats?.mark ?? 0)}</small></div>
        <div className="pt-stats">
          <div><span>Index</span><b>{fp(stats?.index ?? 0)}</b></div>
          <div><span>24h Change</span><b className={chg >= 0 ? "up" : "dn"}>{`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</b></div>
          <div><span>24h High</span><b>{fp(stats?.high ?? 0)}</b></div>
          <div><span>24h Low</span><b>{fp(stats?.low ?? 0)}</b></div>
          <div><span>24h Volume (USDC)</span><b>{fk(stats?.volume ?? 0)}</b></div>
          <div><span>Open Interest</span><b>{fk(stats?.oi ?? 0)}</b></div>
          <div><span>Funding / Countdown</span><b><em className={(stats?.funding ?? 0) >= 0 ? "up" : "dn"}>{((stats?.funding ?? 0) * 100).toFixed(4)}%</em> / {cds}</b></div>
        </div>
        {pick && (
          <div className="pt-pick">
            <input className="ux-search" autoFocus type="search" autoCapitalize="off" autoCorrect="off" placeholder="Search markets (e.g. SEI, Apple, gold)" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pt-plist">
              {shown.map((x) => (
                <button key={x.id} className={x.id === m?.id ? "on" : ""} onClick={() => { setSel(x.id); setPick(false); setQ(""); }}>
                  <span className="ux-mkn"><Logo base={x.base} /><span><b>{x.symbol}</b><small>{(NAMES[x.base] ?? "").replace(/\s[^\x00-\x7F].*$/, "")}</small></span></span>
                  <span className="pt-pr"><b>{fp(x.price)}</b><em className={x.change24h >= 0 ? "up" : "dn"}>{`${x.change24h >= 0 ? "+" : ""}${x.change24h.toFixed(2)}%`}</em></span>
                </button>
              ))}
              {!markets.length && <p className="ux-mut">Loading markets…</p>}
              {!!markets.length && !shown.length && <p className="ux-none">No market found for “{q}”</p>}
            </div>
          </div>
        )}
      </div>

      <div className="pt-grid">
        {/* Trade panel */}
        <section className="pt-trade">
          <h3>TRADE</h3>
          <div className="pt-row2">
            <select value={margin} onChange={(e) => setMargin(e.target.value as "Cross" | "Isolated")}><option>Cross</option><option>Isolated</option></select>
            <select value={lev} onChange={(e) => setLev(+e.target.value)}>{LEVS.filter((l) => l <= MAX_LEV).map((l) => <option key={l} value={l}>{l.toFixed(2)}x</option>)}</select>
          </div>
          <div className="pt-tabs"><button className={otype === "LIMIT" ? "on" : ""} onClick={() => setOtype("LIMIT")}>LIMIT</button><button className={otype === "MARKET" ? "on" : ""} onClick={() => setOtype("MARKET")}>MARKET</button></div>
          {otype === "LIMIT" && <label className="pt-inp"><span>Price</span><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={fp(last)} inputMode="decimal" /><em>USDC</em></label>}
          <label className="pt-inp"><span>Qty</span><input value={qty} onChange={(e) => { setQty(e.target.value); setPct(0); }} placeholder="0.0" inputMode="decimal" /><em>{m?.base}</em></label>
          <div className="pt-slider">
            <input type="range" min={0} max={100} step={1} value={pct} onChange={(e) => setP(+e.target.value)} style={{ ["--p" as string]: pct + "%" }} />
            <div className="pt-stops">{[0, 25, 50, 75, 100].map((p) => <button key={p} className={pct >= p ? "on" : ""} onClick={() => setP(p)}>{p}%</button>)}</div>
          </div>
          <dl className="pt-kv">
            <dt>Value</dt><dd>{value ? value.toFixed(2) : "0.00"} USDC</dd>
            <dt>Cost</dt><dd>{cost ? cost.toFixed(2) : "0.00"} USDC</dd>
            <dt>Liq. Price</dt><dd>{q0 ? `${fp(liqL)} / ${fp(liqS)}` : "— / —"}</dd>
            <dt>Builder fee · 5bps</dt><dd>{(value * 0.0005).toFixed(4)}</dd>
          </dl>
          <label className="pt-chk"><input type="checkbox" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} /> TP/SL</label>
          {tpsl && <div className="pt-row2"><label className="pt-inp"><span>TP</span><input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Take profit" inputMode="decimal" /></label><label className="pt-inp"><span>SL</span><input value={sl} onChange={(e) => setSl(e.target.value)} placeholder="Stop loss" inputMode="decimal" /></label></div>}
          <div className="pt-bs">
            <button className="pt-buy" onClick={() => order("BUY")}>BUY / LONG</button>
            <button className="pt-sell" onClick={() => order("SELL")}>SELL / SHORT</button>
          </div>
          <p className="ux-mut pt-note">{!addr ? "Wallet not connected — " : ""}{canTrade ? "Orders are signed by your own wallet." : "Trading opens soon (demo). Prices, chart and order book are live from Monaco."}</p>
          <h3>UNIFIED TRADING ACCOUNT</h3>
          <dl className="pt-kv"><dt>Margin Mode</dt><dd>{margin} Margin</dd><dt>Margin Balance</dt><dd>{avail.toFixed(2)} USDC</dd><dt>Leverage</dt><dd>{lev}x (max {MAX_LEV}x)</dd></dl>
          <div className="pt-meter"><i style={{ width: "0%" }} /></div>
        </section>

        {/* Chart */}
        <section className="pt-chart">
          <div className="pt-tabs pt-ctabs">{(["CHART", "OVERVIEW", "DATA"] as const).map((t) => <button key={t} className={ctab === t ? "on" : ""} onClick={() => setCtab(t)}>{t}</button>)}</div>
          {ctab === "CHART" && <>
            <div className="ux-tf">{TFS.map((x) => <button key={x} className={tf === x ? "on" : ""} onClick={() => setTf(x)}>{TFN[x] ?? x}</button>)}</div>
            <div className="ux-cbox pt-cbox"><LwChart candles={candles} resetKey={(m?.id ?? "") + tf} /></div>
            {m && <small className="ux-mut">{candleSource[m.id] === "reference" ? `${TFL[tf]} chart · reference price (Hyperliquid), because Monaco has few trades yet. Orders fill on Monaco.` : `${TFL[tf]} chart · Monaco trades`}</small>}
          </>}
          {ctab === "OVERVIEW" && m && <div className="pt-ov"><Logo base={m.base} size={56} /><h2>{(NAMES[m.base] ?? m.base).replace(/\s[^\x00-\x7F].*$/, "")}</h2><p>{m.symbol} perpetual on Monaco (Sei). Trade price moves of {m.base} in USDC — up (Long) or down (Short) — without owning it. Leverage up to {MAX_LEV}x multiplies both wins and losses.</p></div>}
          {ctab === "DATA" && <dl className="pt-kv pt-data"><dt>Mark price</dt><dd>{fp(stats?.mark ?? 0)}</dd><dt>Index price</dt><dd>{fp(stats?.index ?? 0)}</dd><dt>24h volume</dt><dd>{fk(stats?.volume ?? 0)} USDC</dd><dt>Open interest</dt><dd>{fk(stats?.oi ?? 0)}</dd><dt>Funding rate</dt><dd>{((stats?.funding ?? 0) * 100).toFixed(4)}%</dd><dt>Next funding</dt><dd>{cds}</dd><dt>Max leverage</dt><dd>{MAX_LEV}x</dd><dt>Chart data</dt><dd>{m && candleSource[m.id] === "reference" ? "Hyperliquid (reference)" : "Monaco"}</dd></dl>}
        </section>

        {/* Book / trades */}
        <section className="pt-book">
          <div className="pt-tabs"><button className={rtab === "BOOK" ? "on" : ""} onClick={() => setRtab("BOOK")}>ORDER BOOK</button><button className={rtab === "TRADES" ? "on" : ""} onClick={() => setRtab("TRADES")}>TRADE HISTORY</button></div>
          {rtab === "BOOK" ? <>
            <div className="pt-bh"><span>PRICE(USDC)</span><span>QTY</span><span>TOTAL</span></div>
            {askRows.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => <div key={"a" + i} className="pt-lv dn"><i style={{ width: `${(l.size / maxSz) * 100}%` }} /><span>{fp(l.price)}</span><span>{fp(l.size)}</span><span>{fk(askCum[i])}</span></div>)}
            <div className="pt-mid"><b className={chg >= 0 ? "up" : "dn"}>{fp(last)}</b><small>{fp(stats?.mark ?? 0)}</small></div>
            {bidRows.map((l, i) => <div key={"b" + i} className="pt-lv up"><i style={{ width: `${(l.size / maxSz) * 100}%` }} /><span>{fp(l.price)}</span><span>{fp(l.size)}</span><span>{fk(bidCum[i])}</span></div>)}
            {!askRows.length && !bidRows.length && <p className="ux-mut">No orders on the book yet</p>}
            <div className="pt-ratio"><em className="up">B</em><span>{buyPct}%</span><div><i style={{ width: buyPct + "%" }} /></div><span>{100 - buyPct}%</span><em className="dn">S</em></div>
          </> : <>
            <div className="pt-bh"><span>PRICE</span><span>QTY</span><span>TIME</span></div>
            {trades.slice(0, 24).map((t, i) => <div key={i} className={"pt-lv " + (t.side === "BUY" ? "up" : "dn")}><span>{fp(t.price)}</span><span>{fp(t.size)}</span><span>{t.time ? new Date(t.time).toLocaleTimeString("en-GB") : ""}</span></div>)}
            {!trades.length && <p className="ux-mut">No trades yet</p>}
          </>}
        </section>
      </div>

      {/* Bottom tabs */}
      <section className="pt-bottom">
        <div className="pt-tabs">{([["POS", `POSITIONS (${pos.length})`], ["OPEN", "OPEN ORDERS (0)"], ["OHIST", "ORDER HISTORY"], ["THIST", "TRADE HISTORY"]] as const).map(([k, l]) => <button key={k} className={btab === k ? "on" : ""} onClick={() => setBtab(k)}>{l}</button>)}</div>
        <div className="pt-tbl">
          {btab === "POS" && <><div className="pt-th"><span>MARKET</span><span>QTY</span><span>ENTRY PRICE</span><span>MARK PRICE</span><span>LIQ. PRICE</span><span>UNREALIZED PNL</span></div>
            {pos.map((p) => <div key={p.id} className="pt-th pt-td"><span>{p.symbol}</span><span>{p.size}</span><span>{p.entry}</span><span>{p.mark}</span><span>{p.liq ?? "—"}</span><span>{p.pnl}</span></div>)}</>}
          <p className="ux-mut">{!addr ? "Connect your wallet to see your positions and orders." : btab === "POS" && pos.length ? "" : "Nothing here yet."}</p>
        </div>
      </section>

      {/* Ticker */}
      <div className="pt-ticker" ref={ticker}><div>{[...markets, ...markets].map((x, i) => <button key={i} onClick={() => setSel(x.id)}><Logo base={x.base} size={16} /><b>{x.symbol.replace("/", "")}</b><em className={x.change24h >= 0 ? "up" : "dn"}>{`${x.change24h >= 0 ? "+" : ""}${x.change24h.toFixed(2)}%`}</em></button>)}</div></div>
      {toast && <div className="pd-toast" style={{ background: toast.ok ? undefined : "#c00" }}>{toast.t}</div>}
    </div>
  );
}
