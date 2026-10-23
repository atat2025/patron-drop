"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseUnits } from "viem";
import LwChart from "./LwChart";
import { logoOf, matches, NAMES } from "@/lib/marketMeta";

function Logo({ base }: { base: string }) {
  const [bad, setBad] = useState(false);
  const src = logoOf(base);
  return src && !bad ? <img className="ux-logo" src={src} alt="" onError={() => setBad(true)} /> : <i className="ux-logo ux-logo-f">{base.slice(0, 1)}</i>;
}
import {
  loadMarketsByType, loadBookMode, loadCandles, enrichMarkets, loadLiveTrades, connectWallet, placeOrder,
  loadBalances, loadOpenOrders, cancelOrder, loadPositions, depositAsset, marketAssets, candleSource,
  type BalRow, type OrderRow,
} from "@/lib/monaco";
import { mockTrades } from "@/lib/mock";
import { config } from "@/lib/config";
import type { Book, Candle, Market, PositionRow, TradeRow } from "@/lib/types";
import { getEth, requireEth, canConnect } from "@/lib/wallet";

type Tab = "SPOT" | "PERP" | "PATRON";
const TFL = { "1m": "1-minute", "3m": "3-minute", "5m": "5-minute", "15m": "15-minute", "1h": "1-hour", "4h": "4-hour", "1d": "1-day", "1w": "1-week", "1M": "1-month" } as const;
const TFS = ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1w", "1M"] as const;
const TFN: Record<string, string> = { "1h": "1H", "4h": "4H", "1d": "1D", "1w": "1W", "1M": "1M" };
const fp = (x: number) => !x ? "—" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 2 }) : x >= 1 ? x.toFixed(3) : x < 0.001 ? x.toExponential(3) : x.toFixed(5);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Exchange({ perpOnly = false }: { perpOnly?: boolean } = {}) {
  const [tab, setTab] = useState<Tab>("PERP");
  const canTrade = !!config.clientId;
  const [q, setQ] = useState("");
  const [tf, setTf] = useState<(typeof TFS)[number]>("5m");
  const [mk, setMk] = useState<Record<"SPOT" | "PERP", { markets: Market[]; live: boolean } | null>>({ SPOT: null, PERP: null });
  const [sel, setSel] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [liveTape, setLiveTape] = useState(false);
  const [addr, setAddr] = useState<string | null>(null);
  const [bals, setBals] = useState<BalRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [pos, setPos] = useState<PositionRow[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // order form
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [otype, setOtype] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [lev, setLev] = useState("5");
  // deposit
  const [assets, setAssets] = useState<{ assetId: string; symbol: string; decimals: number }[]>([]);
  const [depA, setDepA] = useState("");
  const [depAmt, setDepAmt] = useState("");

  useEffect(() => {
    const load = (t: "SPOT" | "MARGIN", k: "SPOT" | "PERP") => loadMarketsByType(t).then((r) => {
      setMk((m) => ({ ...m, [k]: r }));
      enrichMarkets(r.markets, (u) => setMk((m) => ({ ...m, [k]: m[k] && { ...m[k]!, markets: m[k]!.markets.map((x) => (x.id === u.id ? u : x)) } })));
    });
    load("SPOT", "SPOT"); load("MARGIN", "PERP");
    marketAssets().then((a) => { setAssets(a); if (a[0]) setDepA(a[0].assetId); }).catch(() => {});
  }, []);

  const mtab = tab === "SPOT" ? "SPOT" : "PERP";
  const list = useMemo(() => mk[mtab]?.markets ?? [], [mk, mtab]);
  const m = list.find((x) => x.id === sel) ?? list[0];
  const live = mk[mtab]?.live;
  const mode = tab === "SPOT" ? "SPOT" : "MARGIN";

  useEffect(() => {
    if (!m || tab === "PATRON") return; let on = true;
    const tick = async () => {
      const b = await loadBookMode(m, mode); if (!on) return; setBook(b);
      const lt = await loadLiveTrades(m, mode); if (!on) return;
      if (lt && lt.length) { setTrades(lt); setLiveTape(true); }
      else { const mid = b.bids[0] && b.asks[0] ? (b.bids[0].price + b.asks[0].price) / 2 : m.price || 1; setTrades(m.mock ? mockTrades(mid) : []); setLiveTape(!m.mock); }
    };
    setCandles([]);
    loadCandles(m, tf).then((c) => { if (on) setCandles(c); tick(); });
    const ct = setInterval(() => loadCandles(m, tf).then((c) => on && setCandles(c)), 30000);
    const t = setInterval(tick, 5000); return () => { on = false; clearInterval(t); clearInterval(ct); };
  }, [m?.id, tab, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  const allMarkets = useMemo(() => [...(mk.SPOT?.markets ?? []), ...(mk.PERP?.markets ?? [])], [mk]);
  const refreshAcct = useCallback(async () => {
    if (!addr) return;
    try { setBals(await loadBalances()); } catch (e) { console.warn(e); }
    try { setOrders(await loadOpenOrders(allMarkets)); } catch (e) { console.warn(e); }
    setPos(await loadPositions(allMarkets));
  }, [addr, allMarkets]);
  useEffect(() => { refreshAcct(); if (!addr) return; const t = setInterval(refreshAcct, 8000); return () => clearInterval(t); }, [addr, refreshAcct]);

  const flash = (ok: boolean, t: string) => { setToast({ ok, t }); setTimeout(() => setToast(null), 9000); };
  const connect = async () => {
    try {
      const eth = getEth();
      if (eth && config.network !== "mainnet") {
        await eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x530", chainName: "Sei Testnet (atlantic-2)", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: [config.seiRpcUrl], blockExplorerUrls: ["https://seitrace.com"] }] }).catch(() => {});
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x530" }] }).catch(() => {});
      }
      const a = await connectWallet(); setAddr(a); flash(true, canTrade ? "Signed in to Monaco" : "Wallet connected. Trading opens soon.");
    } catch (e) { flash(false, (e as Error).message.split("\n")[0]); }
  };
  const submit = async () => {
    if (!m) return; if (!addr) return connect();
    if (!canTrade) return flash(false, "Trading opens soon. Prices are live.");
    setBusy(true);
    try { flash(true, await placeOrder({ market: m, mode, side, type: otype, quantity: qty, price: otype === "LIMIT" ? price : undefined, leverage: lev })); refreshAcct(); }
    catch (e) { flash(false, (e as Error).message.split("\n")[0]); }
    setBusy(false);
  };
  const deposit = async () => {
    const a = assets.find((x) => x.assetId === depA); if (!a || !depAmt) return;
    setBusy(true);
    try { const h = await depositAsset(a.assetId, parseUnits(depAmt, a.decimals), (s) => flash(true, s)); flash(true, "Deposited · tx " + short(h)); refreshAcct(); }
    catch (e) { flash(false, (e as Error).message.split("\n")[0]); }
    setBusy(false);
  };
  const cancel = async (id: string) => { try { await cancelOrder(id); flash(true, "Cancelled " + short(id)); refreshAcct(); } catch (e) { flash(false, (e as Error).message.split("\n")[0]); } };

  const last = candles.at(-1)?.c ?? m?.price ?? 0;
  const maxSz = Math.max(1, ...(book ? [...book.bids, ...book.asks].map((l) => l.size) : [1]));

  return (
    <div className="pd ux">
      <header className="pd-top">
        <Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link>
        <div className="pd-actions">
          <span className="ux-net">{config.network === "mainnet" ? "Sei" : "Sei testnet"}</span>
          <button className="pd-wallet" onClick={connect}>{addr ? short(addr) : "Connect Wallet"}</button>
        </div>
      </header>
      <main className="ux-main">
        <div className="ux-head">
          <h1>{perpOnly ? "PERP" : "PATRON Powered by Monaco"}</h1>
          {!perpOnly && <div className="ux-seg">{(["SPOT", "PERP", "PATRON"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setSel(""); }}>{t}</button>)}</div>}
          {tab !== "PATRON" && <span className={"ux-pill " + (live ? "ok" : "")}>{live === undefined ? "Loading…" : live ? (perpOnly ? "Live prices · Monaco" : "Live · Monaco " + config.network) : config.network === "mainnet" ? "Monaco unavailable" : "Monaco unavailable · sample"}</span>}
        </div>

        {tab === "PATRON" ? (
          <div className="ux-cards ux-pt">
            <Link href="/" className="mk-c live"><b>PATRON · Buy / Sell</b><span>Unisocks curve · price chart · staking</span><em>Sei testnet · live →</em></Link>
            <Link href="/vault/" className="mk-c live"><b>PATRON Vault · Deposit</b><span>Deposit PAT · auto-strategy · withdraw anytime</span><em>PatronVault 0x2Bc1…B664 · live →</em></Link>
          </div>
        ) : (
          <div className="ux-grid">
            <aside className="ux-card ux-mk">
              <input className="ux-search" type="search" inputMode="search" autoCapitalize="off" autoCorrect="off" placeholder="Search markets (e.g. SEI, Apple, gold)" value={q} onChange={(e) => setQ(e.target.value)} />
              {list.filter((x) => matches(x.base, x.symbol, q)).map((x) => (
                <button key={x.id} className={x.id === m?.id ? "on" : ""} onClick={() => setSel(x.id)}>
                  <b className="ux-mkn"><Logo base={x.base} /><span>{x.symbol}<small>{(NAMES[x.base] ?? "").replace(/\s[^\x00-\x7F].*$/, "")}</small></span></b><span>{fp(x.price)}</span>
                  <em className={x.change24h >= 0 ? "up" : "dn"}>{`${x.change24h >= 0 ? "+" : ""}${x.change24h.toFixed(2)}%`}</em>
                </button>
              ))}
              {!list.length && <p className="ux-mut">Loading markets…</p>}
              {!!list.length && !list.some((x) => matches(x.base, x.symbol, q)) && <p className="ux-none">No market found for “{q}”</p>}
            </aside>

            <section className="ux-card ux-chart">
              <div className="ux-ph"><h2>{m?.symbol ?? "—"} <small>{tab === "PERP" ? "Perpetual" : "Spot"}</small></h2><b>{fp(last)}</b></div>
              <div className="ux-tf">{TFS.map((x) => <button key={x} className={tf === x ? "on" : ""} onClick={() => setTf(x)}>{TFN[x] ?? x}</button>)}</div>
              <div className="ux-cbox"><LwChart candles={candles} resetKey={(m?.id ?? "") + tf} /></div>
              {m && <small className="ux-mut">{candleSource[m.id] === "reference" ? `${TFL[tf]} chart · reference price (Hyperliquid), because Monaco has few trades yet. Orders fill on Monaco.` : `${TFL[tf]} chart · Monaco trades`}</small>}
            </section>

            <section className="ux-card ux-order">
              <div className="ux-seg2"><button className={side === "BUY" ? "on b" : ""} onClick={() => setSide("BUY")}>{tab === "PERP" ? "Long" : "Buy"}</button><button className={side === "SELL" ? "on s" : ""} onClick={() => setSide("SELL")}>{tab === "PERP" ? "Short" : "Sell"}</button></div>
              <div className="ux-seg3"><button className={otype === "LIMIT" ? "on" : ""} onClick={() => setOtype("LIMIT")}>Limit</button><button className={otype === "MARKET" ? "on" : ""} onClick={() => setOtype("MARKET")}>Market</button></div>
              {otype === "LIMIT" && <label className="ux-inp"><span>Price</span><input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={fp(last)} inputMode="decimal" /><em>{m?.quote}</em></label>}
              <label className="ux-inp"><span>Size</span><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0.0" inputMode="decimal" /><em>{m?.base}</em></label>
              {tab === "PERP" && <label className="ux-inp"><span>Leverage</span><select value={lev} onChange={(e) => setLev(e.target.value)}>{[1, 2, 3, 5, 10, 20].map((l) => <option key={l} value={l}>{l}x</option>)}</select></label>}
              {perpOnly && !canTrade && <div className="pd-err" style={{ margin: "6px 0" }}>Trading opens soon. Prices, chart and order book are live from Monaco.</div>}
              <button className="pd-buy" disabled={(!!addr && !canTrade) || busy || (!!addr && (!qty || (otype === "LIMIT" && !price)))} onClick={submit}>{!addr ? "Connect Wallet" : busy ? "Waiting…" : `${side === "BUY" ? (tab === "PERP" ? "Long" : "Buy") : (tab === "PERP" ? "Short" : "Sell")} ${m?.base ?? ""}`}</button>
              <p className="ux-mut">{tab === "PERP" ? "Long = you win if the price goes up. Short = you win if it goes down. Leverage multiplies wins and losses. " : ""}Orders are signed by your own wallet. {config.network !== "mainnet" && "Testnet funds only."}</p>
            </section>

            <section className="ux-card ux-book">
              <div className="ux-ph"><h2>Order book</h2></div>
              <div className="ux-bh"><span>Price</span><span>Size</span></div>
              {book?.asks.slice(0, 8).reverse().map((l, i) => <div key={"a" + i} className="ux-lv dn"><i style={{ width: `${(l.size / maxSz) * 100}%` }} /><span>{fp(l.price)}</span><span>{fp(l.size)}</span></div>)}
              <div className="ux-mid">{fp(last)}</div>
              {book?.bids.slice(0, 8).map((l, i) => <div key={"b" + i} className="ux-lv up"><i style={{ width: `${(l.size / maxSz) * 100}%` }} /><span>{fp(l.price)}</span><span>{fp(l.size)}</span></div>)}
            </section>

            <section className="ux-card ux-trades">
              <div className="ux-ph"><h2>Trades</h2><small className="ux-mut">{liveTape ? "live" : "sample"}</small></div>
              {trades.slice(0, 16).map((t, i) => <div key={i} className={"ux-tr " + (t.side === "BUY" ? "up" : "dn")}><span>{fp(t.price)}</span><span>{fp(t.size)}</span><span>{t.time ? new Date(t.time).toLocaleTimeString("en-GB") : t.side}</span></div>)}
              {!trades.length && <p className="ux-mut">No trades yet</p>}
            </section>

            <section className="ux-card ux-acct">
              <div className="ux-ph"><h2>Account</h2>{addr && <button className="ux-link" onClick={refreshAcct}>Refresh</button>}</div>
              {!addr ? <p className="ux-mut">Connect your wallet to deposit, trade and see balances, orders and positions.</p> : !canTrade ? <p className="ux-mut">Wallet connected. Deposits and trading open soon.</p> : <>
                <div className="ux-dep">
                  <select value={depA} onChange={(e) => setDepA(e.target.value)}>{assets.map((a) => <option key={a.assetId} value={a.assetId}>{a.symbol}</option>)}</select>
                  <input value={depAmt} onChange={(e) => setDepAmt(e.target.value)} placeholder="Amount" inputMode="decimal" />
                  <button className="pd-sec" disabled={busy || !depAmt} onClick={deposit}>Deposit</button>
                </div>
                <p className="ux-mut">Need test tokens? Use the <a href="https://app.monaco.xyz" target="_blank" rel="noreferrer">Monaco testnet faucet</a> and <a href="https://docs.sei.io/learn/faucet" target="_blank" rel="noreferrer">Sei faucet</a>.</p>
                <h3>Balances</h3>
                {bals.length ? bals.map((b) => <div key={b.assetId} className="ux-row"><b>{b.symbol}</b><span>{b.available}</span><span className="ux-mut">locked {b.locked}</span></div>) : <p className="ux-mut">No balances</p>}
                <h3>Open orders</h3>
                {orders.length ? orders.map((o) => <div key={o.id} className="ux-row"><b className={o.side === "BUY" ? "up" : "dn"}>{o.side}</b><span>{o.pair}</span><span>{o.qty} @ {o.price ?? "MKT"}</span><button className="ux-link" onClick={() => cancel(o.id)}>Cancel</button></div>) : <p className="ux-mut">No open orders</p>}
                <h3>Positions</h3>
                {pos.length ? pos.map((p) => <div key={p.id} className="ux-row"><b className={p.side === "LONG" || p.side === "BUY" ? "up" : "dn"}>{p.side}</b><span>{p.symbol}</span><span>{p.size} @ {p.entry}</span><span>PnL {p.pnl}</span></div>) : <p className="ux-mut">No open positions</p>}
              </>}
            </section>
          </div>
        )}
        {!perpOnly && <div className="ux-cards">
          <Link href="/stocks" className="mk-c"><b>Personal Stock Market</b><em>Coming Soon</em></Link>
          <button className="mk-c live" onClick={() => setTab("PATRON")}><b>PATRON</b><em>Price · Staking · Deposit →</em></button>
        </div>}
      </main>
      {toast && <div className="pd-toast" style={{ background: toast.ok ? undefined : "#c00" }}>{toast.t}</div>}
    </div>
  );
}
