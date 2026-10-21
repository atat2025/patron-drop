"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import Mustache from "./Mustache";
import * as P from "@/lib/patCurve";
import { connect } from "@/lib/bridge";
import { useSeiUsd, fmtUsd } from "@/lib/seiUsd";
import { ResidencyCheck, useResidency } from "@/lib/residency";
import * as PW from "@/lib/payWith";
import { formatUnits } from "viem";

const n = (v?: bigint, d = 2) => (v === undefined ? "…" : Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: d }));
const seiS = (v?: bigint) => (v === undefined ? "…" : `${Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 4 })} SEI`);

export default function PatCurvePage({ drop = "../", panel, start = "buy", onDone }: { drop?: string; panel?: boolean; start?: "buy" | "sell"; onDone?: () => void }) {
  const { usd } = useSeiUsd();
  const ok = useResidency();
  const usdOf = (v?: bigint) => (v === undefined ? "…" : fmtUsd(Number(formatEther(v)) * usd));
  const [st, setSt] = useState<Awaited<ReturnType<typeof P.readCurve>>>();
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint>();
  const [side, setSide] = useState<"buy" | "sell">(start);
  const [amt, setAmt] = useState("");
  const [q, setQ] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const [coin, setCoin] = useState<PW.Coin>(PW.COINS[0]);
  const [bals, setBals] = useState<Record<string, bigint>>({});
  const [usdcNeed, setUsdcNeed] = useState<bigint>();
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string; h?: string } | null>(null);

  const load = useCallback(async () => { try { setSt(await P.readCurve()); } catch {} if (me) { try { setBal(await P.patBalance(me)); } catch {} try { setBals(await PW.balances(me)); } catch {} } }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const patFor = (dollars: number) => (st && usd ? String(Math.max(1, Math.floor(dollars / (Number(formatEther(st.price)) * usd)))) : "");
  useEffect(() => { if (!amt && st && usd) setAmt(side === "buy" ? patFor(5) : bal ? String(Math.floor(Number(formatEther(bal)))) : "1"); }, [st, usd]); // eslint-disable-line react-hooks/exhaustive-deps
  let wei = 0n; try { wei = amt ? parseEther(amt) : 0n; } catch {}
  useEffect(() => {
    setQ(undefined); if (wei <= 0n) return;
    const t = setTimeout(async () => {
      try { if (side === "buy") { const [c, f] = await P.quoteBuy(wei); setQ(c + f); } else { const [g, f] = await P.quoteSell(wei); setQ(g - f); } } catch { setQ(undefined); }
    }, 300);
    return () => clearTimeout(t);
  }, [amt, side, st]); // eslint-disable-line react-hooks/exhaustive-deps

  const payAlt = side === "buy" && coin.sym !== "SEI";
  const seiNeed = q === undefined ? undefined : (q * 102n) / 100n;
  useEffect(() => { setUsdcNeed(undefined); if (coin.sym === "USDC" && seiNeed) PW.usdcFor(seiNeed).then((r) => setUsdcNeed(r.est)).catch(() => {}); }, [coin, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true); setMsg(null);
    try { const a = me ?? (await connect()); setMe(a);
      if (payAlt && seiNeed) { await PW.getSei(coin, seiNeed, setStep); setStep("Buying PAT…"); }
      const h = side === "buy" ? await P.buy(wei) : await P.sell(wei); setMsg({ ok: true, t: `${side === "buy" ? "Bought" : "Sold"} ${amt} PAT`, h }); load(); onDone?.(); }
    catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); }
    setStep(""); setBusy(false);
  };
  const empty = st && st.inv === 0n;

  const trade = (
<section className="pv-card">
          <div className="pd-tabs" style={{ alignSelf: "flex-start" }}>
            <button className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>Buy</button>
            <button className={side === "sell" ? "on" : ""} onClick={() => setSide("sell")}>Sell</button></div>
          <small>{side === "buy" ? "How many PAT do you want to buy?" : "How many PAT do you want to sell?"}</small>
          {side === "buy" && <div className="pd-tabs">{[5, 10, 25, 100].map((d) => <button key={d} onClick={() => setAmt(patFor(d))}>${d}</button>)}</div>}
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(",", "."))} /><span>PAT</span></div>
          {side === "buy" && <div className="br-row"><small>Pay with</small>
            <span className="pd-tabs">{PW.COINS.map((k) => <button key={k.sym} className={coin.sym === k.sym ? "on" : ""} onClick={() => setCoin(k)}>{k.sym}{me && bals[k.sym] !== undefined ? ` ${Number(formatUnits(bals[k.sym], k.dec)).toLocaleString("en-US", { maximumFractionDigits: k.dec === 6 ? 2 : 3 })}` : ""}</button>)}</span></div>}
          {me && <div className="br-row"><small>Your PAT on Sei</small><small>{n(bal, 4)}</small></div>}
          <div className="br-row"><small>{side === "buy" ? "You pay" : "You get"}</small>
            <span style={{ textAlign: "right" }}><b>{usdOf(q)}</b><br /><small>{payAlt && coin.sym === "USDC" ? (usdcNeed === undefined ? "…" : `about ${Number(formatUnits(usdcNeed, 6)).toFixed(2)} USDC`) : payAlt ? seiS(seiNeed) + " WSEI" : seiS(q)}</small></span></div>
          {payAlt && <small className="pd-fine">We first turn your {coin.sym} into SEI on DragonSwap (you sign {coin.sym === "USDC" ? "1–2 times" : "once"}), then buy. If the price moves more than 3%, nothing is swapped. Keep a little SEI for fees.</small>}
          {st?.paused && side === "buy" && <div className="pd-err">Buying is paused. Selling stays open.</div>}
          {empty && side === "buy" && <div className="pd-err">Sold out for now. More PAT may be added.</div>}
          <ResidencyCheck />
          <button className="pd-buy" disabled={busy || !ok || wei <= 0n || q === undefined || (side === "buy" && !!st?.paused)} onClick={go}>
            {busy ? step || "Confirm in wallet…" : `${side === "buy" ? "Buy" : "Sell"} ${Number(amt || 0).toLocaleString("en-US")} PAT${q !== undefined ? ` for ${usdOf(q)}` : ""}`}</button>
          {msg && <div className={msg.ok ? "pv-ok" : "pd-err"}>{msg.t}{msg.h && <> · <a href={`https://seiscan.io/tx/${msg.h}`} target="_blank" rel="noreferrer">tx ↗</a></>}</div>}
        </section>);
  if (panel) return <div className="pd-mbody">{trade}</div>;
  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">SEI</span>
          <button className="pd-wallet" onClick={async () => { try { setMe(await connect()); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); } }}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>{usdOf(st?.price)}</h1><p>PAT on Sei · {seiS(st?.price)}</p></div>
          <div className="br-row" style={{ marginTop: 14, color: "#ccc" }}><small>Available {n(st?.inv, 0)} PAT</small><small>Sold {n(st?.sold, 0)}</small></div>
          <div className="br-row" style={{ color: "#ccc" }}><small>Money held {usdOf(st?.backing)}</small><small>{seiS(st?.backing)}</small></div>
        </section>
        {trade}
        <p className="pd-fine">Price rises gently as PAT is bought and falls as it is sold back. Money paid by buyers stays locked here so sellers can always be paid back. Need PAT on Sei? <a href="../bridge/">Bridge it</a>. Coins on another chain? Turn them into SEI on Sei with <a href="https://relay.link/bridge/sei" target="_blank" rel="noreferrer">Relay ↗</a>, then buy here. Contract <a href={`https://seiscan.io/address/${P.CURVE}`} target="_blank" rel="noreferrer">{P.CURVE.slice(0, 10)}… ↗</a></p>
      </main>
    </div>
  );
}
