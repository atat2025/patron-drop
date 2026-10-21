"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import Mustache from "./Mustache";
import * as P from "@/lib/patCurve";
import { connect } from "@/lib/bridge";
import { useSeiUsd, fmtUsd } from "@/lib/seiUsd";
import { ResidencyCheck, useResidency } from "@/lib/residency";

const n = (v?: bigint, d = 2) => (v === undefined ? "…" : Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: d }));
const seiS = (v?: bigint) => (v === undefined ? "…" : `${Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 4 })} SEI`);

export default function PatCurvePage({ drop = "../" }: { drop?: string }) {
  const { usd } = useSeiUsd();
  const ok = useResidency();
  const usdOf = (v?: bigint) => (v === undefined ? "…" : fmtUsd(Number(formatEther(v)) * usd));
  const [st, setSt] = useState<Awaited<ReturnType<typeof P.readCurve>>>();
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint>();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("100");
  const [q, setQ] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string; h?: string } | null>(null);

  const load = useCallback(async () => { try { setSt(await P.readCurve()); } catch {} if (me) try { setBal(await P.patBalance(me)); } catch {} }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  let wei = 0n; try { wei = amt ? parseEther(amt) : 0n; } catch {}
  useEffect(() => {
    setQ(undefined); if (wei <= 0n) return;
    const t = setTimeout(async () => {
      try { if (side === "buy") { const [c, f] = await P.quoteBuy(wei); setQ(c + f); } else { const [g, f] = await P.quoteSell(wei); setQ(g - f); } } catch { setQ(undefined); }
    }, 300);
    return () => clearTimeout(t);
  }, [amt, side, st]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async () => {
    setBusy(true); setMsg(null);
    try { const a = me ?? (await connect()); setMe(a); const h = side === "buy" ? await P.buy(wei) : await P.sell(wei); setMsg({ ok: true, t: `${side === "buy" ? "Bought" : "Sold"} ${amt} PAT`, h }); load(); }
    catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); }
    setBusy(false);
  };
  const empty = st && st.inv === 0n;

  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">MAINNET</span>
          <button className="pd-wallet" onClick={async () => { try { setMe(await connect()); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); } }}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>{usdOf(st?.price)}</h1><p>PAT on Sei · {seiS(st?.price)}</p></div>
          <div className="br-row" style={{ marginTop: 14, color: "#ccc" }}><small>Available {n(st?.inv, 0)} PAT</small><small>Sold {n(st?.sold, 0)}</small></div>
          <div className="br-row" style={{ color: "#ccc" }}><small>Money held {usdOf(st?.backing)}</small><small>{seiS(st?.backing)}</small></div>
        </section>
        <section className="pv-card">
          <div className="pd-tabs" style={{ alignSelf: "flex-start" }}>
            <button className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>Buy</button>
            <button className={side === "sell" ? "on" : ""} onClick={() => setSide("sell")}>Sell</button></div>
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(",", "."))} /><span>PAT</span></div>
          {me && <div className="br-row"><small>Your PAT on Sei</small><small>{n(bal, 4)}</small></div>}
          <div className="br-row"><small>{side === "buy" ? "You pay" : "You get"}</small>
            <span style={{ textAlign: "right" }}><b>{usdOf(q)}</b><br /><small>{seiS(q)}</small></span></div>
          {st?.paused && side === "buy" && <div className="pd-err">Buying is paused. Selling stays open.</div>}
          {empty && side === "buy" && <div className="pd-err">Sold out for now. More PAT may be added.</div>}
          <ResidencyCheck />
          <button className="pd-buy" disabled={busy || !ok || wei <= 0n || q === undefined || (side === "buy" && !!st?.paused)} onClick={go}>
            {busy ? "Confirm in wallet…" : `${side === "buy" ? "Buy" : "Sell"} ${amt || 0} PAT`}</button>
          {msg && <div className={msg.ok ? "pv-ok" : "pd-err"}>{msg.t}{msg.h && <> · <a href={`https://seiscan.io/tx/${msg.h}`} target="_blank" rel="noreferrer">tx ↗</a></>}</div>}
        </section>
        <p className="pd-fine">Price rises gently as PAT is bought and falls as it is sold back. Money paid by buyers stays locked here so sellers can always be paid back. Need PAT on Sei? <a href="../bridge/">Bridge it</a>. Contract <a href={`https://seiscan.io/address/${P.CURVE}`} target="_blank" rel="noreferrer">{P.CURVE.slice(0, 10)}… ↗</a></p>
      </main>
    </div>
  );
}
