"use client";
import { useEffect, useMemo, useState } from "react";
import * as chain from "@/lib/patronChain";
import { formatEther } from "viem";
import Mustache from "./Mustache";
import CardBuy from "./CardBuy";
import EasyLogin from "./EasyLogin";
import { Countdown, LiquidityGauge } from "./DropMeters";
import { loadMarketFills, type Fill } from "@/lib/launchHistory";
import { NET, isTestnet } from "@/lib/network";

/* Unisocks-style constant-product curve (x*y=k), priced client-side in USD. DEMO ONLY. */
const SUPPLY = 500;
const EXT = process.env.NEXT_PUBLIC_HOME_URL || "https://patron.red";
const connectWallet = chain.connect;
const LIVE = chain.chainEnabled; // contracts configured -> real Sei TESTNET txs
const TAG = LIVE ? NET.label : "DEMO";
// Same x*y=k math as PatronMarket.sol. Demo: USD, start $25. Testnet: SEI, start = virtualSei/500 (read from chain).
const curve = { start: 25, unit: LIVE ? "SEI" : "USD" };
let START_PRICE = curve.start;
const FEE = 0.003;
const K = () => START_PRICE * SUPPLY * SUPPLY;
const reserveOf = (r: number) => K() / r;
const buyCost = (r: number, n: number) => (n <= 0 || n >= r ? Infinity : (reserveOf(r - n) - reserveOf(r)) * (1 + FEE));
const sellGain = (r: number, n: number) => (n <= 0 ? 0 : (reserveOf(r) - reserveOf(r + n)) * (1 - FEE));
const fmt = (n: number) => (!isFinite(n) ? "—" : LIVE ? n.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " SEI" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

type Mode = null | "easy" | "card" | "buy" | "sell" | "redeem" | "stats";
interface St { pool: number; held: number; redeemed: number }
const KEY = "patron-drop-demo";

export default function PatronDrop() {
  const [embed, setEmbed] = useState(false);
  useEffect(() => { setEmbed(new URLSearchParams(location.search).get("embed") === "1"); }, []);
  const [st, setSt] = useState<St>({ pool: 445, held: 0, redeemed: 37 });
  const [addr, setAddr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chainErr, setChainErr] = useState<string | null>(null);
  const refresh = async (a = addr) => {
    if (!LIVE) return;
    try {
      const c = await chain.readState();
      START_PRICE = Number(formatEther(c.virtualSei)) / SUPPLY;
      const held = a && a.startsWith("0x") && a.length === 42 ? await chain.readBalance(a as `0x${string}`) : 0;
      setSt({ pool: c.reserve, held, redeemed: c.redeemed }); setChainErr(null);
    } catch (e) { setChainErr("Can't read the PATRON contract: " + (e as Error).message.split("\n")[0]); }
  };
  useEffect(() => {
    if (LIVE) { refresh(); const t = setInterval(() => refresh(), 8000); return () => clearInterval(t); }
    try { const s = localStorage.getItem(KEY); if (s) setSt(JSON.parse(s)); } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addr]);
  const save = (s: St) => { setSt(s); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  const price = buyCost(st.pool, 1);
  const connect = async () => {
    if (LIVE) {
      try { await chain.addSeiTestnet(); setAddr(await connectWallet()); } catch (e) { flash((e as Error).message); }
      return;
    }
    try { setAddr(await connectWallet()); } catch { setAddr("0xDEMO…7a11"); setToast("No wallet found — using a demo address."); }
  };
  const flash = (m: string, link?: string) => { setToast(m); setTxLink(link || null); setTimeout(() => setToast(null), 6000); };
  const [txLink, setTxLink] = useState<string | null>(null);
  const runBuy = async (n: number, v: number, pay?: string) => {
    if (LIVE) { const h = pay === "USDC" || pay === "mUSDC" ? await chain.buyUsdc(pay, n) : await chain.buy(n); if (!addr) setAddr(await connectWallet()); await refresh(); setMode(null); flash(`${TAG}: bought ${n} $PATRON`, chain.explorerTx(h)); return; }
    await new Promise((r) => setTimeout(r, 900));
    save({ ...st, pool: st.pool - n, held: st.held + n }); setMode(null); flash(`DEMO: bought ${n} $PATRON for ${fmt(v)}`);
  };
  const runSell = async (n: number, v: number) => {
    if (LIVE) { const h = await chain.sell(n); await refresh(); setMode(null); flash(`${TAG}: sold ${n} $PATRON`, chain.explorerTx(h)); return; }
    await new Promise((r) => setTimeout(r, 900));
    save({ ...st, pool: st.pool + n, held: st.held - n }); setMode(null); flash(`DEMO: sold ${n} $PATRON for ${fmt(v)}`);
  };
  const runRedeem = async (n: number) => {
    if (LIVE) { const h = await chain.redeem(n); await refresh(); flash(`${TAG}: redeemed ${n} $PATRON`, chain.explorerTx(h)); return; }
    save({ ...st, held: st.held - n, redeemed: st.redeemed + n });
  };

  return (
    <div className={"pd" + (embed ? " embed" : "")}>
      {!embed && <header className="pd-top">
        <a className="pd-brand" href={EXT || "#"}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions">
          <span className={`pd-demo ${LIVE ? "live" : ""}`}>{TAG}</span>
          <span className="pd-burn">🔥 {st.redeemed}<span className="pd-hide"> redeemed</span></span>
          <button className="pd-wallet" onClick={connect}>{addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet"}</button>
        </div>
      </header>}

      <main className="pd-main">
        {LIVE && isTestnet && <div className="pd-tn" role="note"><b>テストネット</b> 試し用のネットワークです。お金の価値はありません。</div>}
        <section className="pd-card">
          <div className="pd-card-h"><h1>PATRON Edition 0</h1><p>$PATRON</p></div>
          <Art />
          <div className="pd-card-f">
            <div><b>{fmt(price)}{LIVE ? "" : " USD"}</b><small>{st.pool}/{SUPPLY} available</small></div>
            <button className="pd-stats" onClick={() => setMode("stats")}><em>Dynamic Pricing Stats</em><span>?</span></button>
          </div>
        </section>
        <Countdown />
        <LiquidityGauge />
        <div className="pd-info">Buy and sell a limited mustache token. Redeem it for a PATRON reward. <a onClick={() => setMode("stats")}>Learn more</a>
          {addr && <div className="pd-bal">You hold <b>{st.held}</b> $PATRON</div>}
          {LIVE && <div className="pd-net">{NET.chainName} · {NET.chainId} · <a href={chain.explorerAddr(chain.MARKET)} target="_blank" rel="noreferrer">contract</a> · <a onClick={() => chain.addSeiTestnet().catch((e) => flash((e as Error).message))}>Add {isTestnet ? "Sei testnet" : "Sei"}</a>{NET.faucet && <> · <a href={NET.faucet} target="_blank" rel="noreferrer">faucet</a></>}</div>}
          {chainErr && <div className="pd-err">{chainErr}</div>}
        </div>
        <button className="pd-buy" onClick={() => setMode("buy")}>Buy</button>
        {LIVE && isTestnet && <button className="pd-sec cb-open" style={{ fontSize: 20 }} onClick={() => setMode("easy")}>かんたんログインで買う（ウォレット不要）<br /><small>テストネット専用・実際のお金は使えません</small></button>}
        {LIVE && <button className="pd-sec cb-open" onClick={() => setMode("card")}>カード / Apple PayでPATRONを買う</button>}
        <div className="pd-row">
          <button className="pd-sec" disabled={!addr || st.held < 1} onClick={() => setMode("sell")}>Sell</button>
          <button className="pd-sec" disabled={!addr || st.held < 1} onClick={() => setMode("redeem")}>Redeem</button>
        </div>
        <PriceSection st={st} />
        <StakeSection held={st.held} />
        {!embed && <a className="pd-sec pd-link" href="vault/">PATRON Vault: 自動売買（{isTestnet ? "テストネット" : "本番"}） →</a>}
        {!embed && EXT && <p className="pd-foot"><a href={EXT} target="_blank" rel="noreferrer">patron.red →</a></p>}
        <p className="pd-foot">{LIVE ? (isTestnet ? "テストネット: Sei testnetのSEIを使います（お金の価値はありません）。配送先はブロックチェーンに載せません。" : "Shipping details are never put on-chain.") : "Demo mode: no real payments, tokens or shipping. State is stored only in this browser."}</p>
      </main>

      {mode && <div className="pd-ov" onClick={() => setMode(null)}>
        <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
          {mode === "easy" && <EasyLogin onAddr={(a) => { setAddr(a); refresh(a); }} onDone={() => refresh()} />}
          {mode === "card" && <CardBuy addr={addr} connect={connect} max={Math.max(1, st.pool - 1)} onDone={() => refresh()} />}
          {mode === "buy" && <Trade kind="buy" st={st} addr={addr} connect={connect} onDone={runBuy} />}
          {mode === "sell" && <Trade kind="sell" st={st} addr={addr} connect={connect} onDone={runSell} />}
          {mode === "redeem" && <Redeem st={st} onDone={runRedeem} close={() => setMode(null)} />}
          {mode === "stats" && <Stats st={st} />}
        </div>
      </div>}
      {toast && <div className="pd-toast">{toast}{txLink && <> · <a href={txLink} target="_blank" rel="noreferrer">view tx</a></>}</div>}
    </div>
  );
}

function Art({ small }: { small?: boolean }) {
  return <div className={`pd-art ${small ? "sm" : ""}`}><span className="pd-coin"><Mustache size={small ? 110 : 150} /></span></div>;
}

function Stepper({ n, set, max }: { n: number; set: (n: number) => void; max: number }) {
  return <div className="pd-step"><button onClick={() => set(Math.max(1, n - 1))}>-</button><span>{n}</span><button onClick={() => set(Math.min(max, n + 1))}>+</button></div>;
}

function Trade({ kind, st, addr, connect, onDone }: { kind: "buy" | "sell"; st: St; addr: string | null; connect: () => void; onDone: (n: number, v: number, pay?: string) => Promise<void> }) {
  const [n, setN] = useState(1);
  const [pay, setPay] = useState(LIVE ? "SEI" : "USDC");
  const [uq, setUq] = useState<bigint | null>(null);
  useEffect(() => { if (!LIVE || kind !== "buy" || pay === "SEI") return setUq(null); let on = true; chain.quoteUsdc(pay as chain.UsdcKind, n).then(([q]) => on && setUq(q)).catch(() => on && setUq(null)); return () => { on = false; }; }, [pay, n, kind]);
  const usdcPay = LIVE && kind === "buy" && pay !== "SEI";
  const [busy, setBusy] = useState(false);
  const max = kind === "buy" ? Math.max(1, st.pool - 1) : Math.max(1, st.held);
  const v = kind === "buy" ? buyCost(st.pool, n) : sellGain(st.pool, n);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => { setBusy(true); setErr(null); try { await onDone(n, v, pay); } catch (e) { setErr((e as Error).message.split("\n")[0]); } setBusy(false); };
  return <>
    <div className="pd-mcard">
      <div className="pd-mh">{kind === "buy" ? "Pay" : "Sell"} <span className={`pd-demo ${LIVE ? "live" : ""}`}>{TAG}</span></div>
      <Art small />
      <div className="pd-card-f"><div><b>{fmt(v)}</b><small>{st.pool}/{SUPPLY} available</small></div><Stepper n={n} set={setN} max={max} /></div>
    </div>
    <div className="pd-mbody">
      <em>{kind === "buy" ? "How do you want to pay?" : "What do you want to receive?"}</em>
      <select className="pd-sel" value={pay} onChange={(e) => setPay(e.target.value)} disabled={LIVE && kind !== "buy"}>
        {(LIVE ? (kind === "buy" && isTestnet ? ["SEI", "USDC", "mUSDC"] : ["SEI"]) : ["USDC", "SEI", "ETH"]).map((t) => <option key={t} value={t}>{LIVE ? (t === "SEI" ? "Testnet SEI" : chain.USDC_ROUTES[t as chain.UsdcKind].label) : t}</option>)}
      </select>
      <small className="pd-fine">Includes 0.3% curve fee · avg {fmt(v / n)} each</small>
      {!addr && !(LIVE && kind === "buy") ? <button className="pd-buy" onClick={connect}>Connect Wallet</button>
        : <button className="pd-buy" disabled={busy || !isFinite(v)} onClick={go}>{busy ? (LIVE ? "Confirm in wallet…" : "Confirming (demo)…") : `${kind === "buy" ? "Buy" : "Sell"} ${n} $PATRON (${TAG.toLowerCase()})`}</button>}
      {usdcPay && <small className="pd-fine">≈ {uq == null ? "…" : (Number(uq) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 })} {pay} · one free signature (permit, no approve tx) + one transaction{pay === "mUSDC" && <> · <a onClick={() => chain.mintTestUsdc().catch((e) => setErr((e as Error).message.split("\n")[0]))}>get 100 test mUSDC</a></>}{pay === "USDC" && <> · <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">USDC faucet</a></>}</small>}
      {LIVE && <small className="pd-fine">1% slippage protection{kind === "sell" ? "; first sell asks for an approve tx" : ""}{kind === "buy" && !addr ? " · wallet connects and switches to Sei testnet automatically" : ""}.</small>}
      {err && <div className="pd-err">{err}</div>}
    </div>
  </>;
}

function Redeem({ st, onDone, close }: { st: St; onDone: (n: number) => Promise<void>; close: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<"burn" | "form" | "done">("burn");
  const [n, setN] = useState(1);
  const [f, setF] = useState({ name: "", email: "", line1: "", city: "", zip: "", country: "" });
  const ok = Object.values(f).every((x) => x.trim());
  return <>
    <div className="pd-mcard">
      <div className="pd-mh">Redeem <span className={`pd-demo ${LIVE ? "live" : ""}`}>{TAG}</span></div>
      <Art small />
      <div className="pd-card-f"><div><b>{step === "done" ? "Redeemed" : `Burn ${n} $PATRON`}</b><small>You hold {st.held}</small></div>{step === "burn" && <Stepper n={n} set={setN} max={Math.max(1, st.held)} />}</div>
    </div>
    <div className="pd-mbody">
      {step === "burn" && <><em>Redeem one token for one PATRON reward pack (merch + members experience). Burning is permanent.</em>
        <button className="pd-buy" onClick={() => setStep("form")}>Redeem {n} ({TAG.toLowerCase()})</button></>}
      {step === "form" && <>
        <em>Where should we send it?</em>
        {([["name", "Full name"], ["email", "Email"], ["line1", "Street address"], ["city", "City"], ["zip", "Postal code"], ["country", "Country"]] as const).map(([k, l]) =>
          <input key={k} className="pd-in" placeholder={l} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
        <small className="pd-fine">{LIVE ? "Only the burn goes on-chain (Redeemed event). Shipping details stay in this page — nothing is sent anywhere in this testnet build." : "Demo only — nothing is sent or stored outside this page."}</small>
        <button className="pd-buy" disabled={!ok || busy} onClick={async () => { setBusy(true); setErr(null); try { await onDone(n); setStep("done"); } catch (e) { setErr((e as Error).message.split("\n")[0]); } setBusy(false); }}>{busy ? "Confirm in wallet…" : `Burn & claim (${TAG.toLowerCase()})`}</button>
        {err && <div className="pd-err">{err}</div>}</>}
      {step === "done" && <><em>Thanks, {f.name.split(" ")[0]}! In a live drop your reward would ship to {f.city}, {f.country}. ({LIVE ? "Testnet: burn confirmed on-chain; no shipping data was sent." : "Demo: no data was sent."})</em>
        <button className="pd-buy" onClick={close}>Done</button></>}
    </div>
  </>;
}

function Stats({ st }: { st: St }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pts = useMemo(() => Array.from({ length: SUPPLY - 10 }, (_, i) => ({ s: i, p: buyCost(SUPPLY - i, 1) })), [START_PRICE]);
  const W = 320, H = 170, maxP = pts[pts.length - 1].p;
  const x = (s: number) => (s / SUPPLY) * W, y = (p: number) => H - (Math.log(p) - Math.log(pts[0].p)) / (Math.log(maxP) - Math.log(pts[0].p)) * (H - 10);
  const sold = SUPPLY - st.pool;
  return <div className="pd-mbody">
    <div className="pd-mh dark">Dynamic Pricing Stats</div>
    <svg viewBox={`0 0 ${W} ${H}`} className="pd-chart">
      <path d={"M" + pts.map((q) => `${x(q.s).toFixed(1)},${y(q.p).toFixed(1)}`).join(" L")} fill="none" stroke="var(--pd-red)" strokeWidth="2" />
      <line x1={x(sold)} x2={x(sold)} y1="0" y2={H} stroke="#999" strokeDasharray="3 3" />
      <circle cx={x(sold)} cy={y(buyCost(st.pool, 1))} r="5" fill="var(--pd-red)" />
    </svg>
    <small className="pd-fine">Price (log scale) vs. tokens sold. Constant-product curve x·y=k: each purchase raises the price of the next; selling lowers it.</small>
    <dl className="pd-dl">
      <dt>Current price</dt><dd>{fmt(buyCost(st.pool, 1))}</dd>
      <dt>Sold / supply</dt><dd>{sold} / {SUPPLY}</dd>
      <dt>Redeemed (burned)</dt><dd>{st.redeemed}</dd>
      <dt>Next 10 cost</dt><dd>{fmt(buyCost(st.pool, 10))}</dd>
    </dl>
  </div>;
}

function PriceSection({ st }: { st: St }) {
  const [fills, setFills] = useState<Fill[] | null>(null);
  const [view, setView] = useState<"history" | "curve">("history");
  useEffect(() => { if (LIVE) loadMarketFills(chain.MARKET).then(setFills).catch(() => setFills([])); else setFills([]); }, [st.pool]);
  const now = buyCost(st.pool, 1);
  const hist = fills && fills.length ? [...fills.map((f) => f.price), now] : [];
  const useHist = view === "history" && hist.length >= 2;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const curvePts = useMemo(() => Array.from({ length: 49 }, (_, i) => buyCost(SUPPLY - i * 10, 1)), [START_PRICE]);
  const ys = useHist ? hist : curvePts;
  const W = 320, H = 150, mn = Math.min(...ys), mx = Math.max(...ys), r = mx - mn || 1;
  const X = (i: number) => (i / (ys.length - 1)) * W, Y = (v: number) => H - 8 - ((v - mn) / r) * (H - 16);
  const d = "M" + ys.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" L");
  const mark = useHist ? ys.length - 1 : Math.min(48, (SUPPLY - st.pool) / 10);
  return (
    <section className="pd-panel">
      <div className="pd-ph"><b>Price</b>
        <div className="pd-tabs"><button className={view === "history" ? "on" : ""} onClick={() => setView("history")}>History</button><button className={view === "curve" ? "on" : ""} onClick={() => setView("curve")}>Curve</button></div></div>
      <div className="pd-pbig">{fmt(now)}{LIVE ? "" : " USD"}<small> next token</small></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pd-chart">
        <path d={d + ` L${W},${H} L0,${H}Z`} fill="var(--pd-red)" opacity=".08" />
        <path d={d} fill="none" stroke="var(--pd-red)" strokeWidth="2" />
        <circle cx={X(mark)} cy={Y(useHist ? now : buyCost(st.pool, 1))} r="5" fill="var(--pd-red)" />
      </svg>
      <small className="pd-fine">{useHist ? `${fills!.length} on-chain trade${fills!.length === 1 ? "" : "s"} (Bought/Sold events on ${NET.chainName})` : fills === null ? "Loading on-chain trades…" : view === "history" ? "No trades yet, showing the curve. Dot = now." : "Price vs. tokens sold (x·y=k). Dot = now."}</small>
      {!!fills?.length && <div className="pd-fills">{fills.slice(-4).reverse().map((f) => (
        <a key={f.tx} href={chain.explorerTx(f.tx)} target="_blank" rel="noreferrer"><span className={f.side === "BUY" ? "b" : "s"}>{f.side === "BUY" ? "Buy" : "Sell"} {f.amount}</span><span>{fmt(f.price)} each ↗</span></a>))}</div>}
    </section>
  );
}

function StakeSection({ held }: { held: number }) {
  const APR = 12;
  const [staked, setStaked] = useState(0);
  const [t0, setT0] = useState(0);
  const [n, setN] = useState(1);
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const reward = staked && t0 ? staked * (APR / 100) * ((now - t0) / 31_536_000_000) : 0;
  return (
    <section className="pd-panel">
      <div className="pd-ph"><b>Stake $PATRON</b><span className="pd-demo">DEMO</span></div>
      <dl className="pd-dl">
        <dt>APR</dt><dd>{APR}%</dd>
        <dt>Staked</dt><dd>{staked}</dd>
        <dt>Rewards</dt><dd>{reward.toFixed(6)}</dd>
      </dl>
      <div className="pd-srow"><Stepper n={n} set={setN} max={99} />
        <button className="pd-buy sm" onClick={() => { setStaked(staked + n); if (!t0) setT0(Date.now()); }}>Stake</button>
        <button className="pd-sec sm" disabled={!staked} onClick={() => { const s = Math.max(0, staked - n); setStaked(s); if (!s) setT0(0); }}>Unstake</button></div>
      <small className="pd-fine">No staking contract yet. APR and rewards are simulated in this browser. You hold {held}.</small>
    </section>
  );
}
