"use client";
import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, formatEther, parseEther, type Address } from "viem";
import * as R from "@/lib/rhBuy";
import { Art } from "./PatronDrop";
import { connect, switchTo, robinhood, pub } from "@/lib/bridge";
import { friendlyErr, getEth, requireEth } from "@/lib/wallet";
import { ResidencyCheck, useResidency } from "@/lib/residency";

const fmtUsd = (v: number) => (!v ? "…" : v < 1 ? `$${v.toFixed(v < 0.01 ? 5 : 4)}` : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const pat = (v?: bigint, d = 2) => (v === undefined ? "…" : Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: d }));
const eth = (v?: bigint) => (v === undefined ? "…" : `${Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ETH`);
const EXP = "https://robinhoodchain.blockscout.com";

export default function RhBuyPage({ drop = "/" }: { drop?: string }) {
  const ok = useResidency();
  const [usd, setUsd] = useState(0);
  const [spot, setSpot] = useState<Awaited<ReturnType<typeof R.readSpot>>>();
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<{ pat?: bigint; eth?: bigint }>({});
  const [amt, setAmt] = useState("");
  const [q, setQ] = useState<{ nvda: bigint; pat: bigint }>();
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string; h?: string } | null>(null);

  const load = useCallback(async () => {
    try { setSpot(await R.readSpot()); } catch {}
    if (me) { try { const [p, e] = await Promise.all([R.patBalance(me), R.ethBalance(me)]); setBal({ pat: p, eth: e }); } catch {} }
  }, [me]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { R.ethUsd().then(setUsd); const t = setInterval(() => R.ethUsd().then((v) => v && setUsd(v)), 60000); return () => clearInterval(t); }, []);

  const priceUsd = spot && usd ? spot.ethPerPat * usd : 0;
  const ethFor = (dollars: number) => (usd ? (dollars / usd).toFixed(6).replace(/0+$/, "") : "");
  useEffect(() => { if (!amt && usd) setAmt(ethFor(10)); }, [usd]); // eslint-disable-line react-hooks/exhaustive-deps

  let wei = 0n; try { wei = amt ? parseEther(amt) : 0n; } catch {}
  useEffect(() => {
    setQ(undefined); setQErr(null); if (wei <= 0n) return;
    const t = setTimeout(async () => { try { setQ(await R.quote(wei)); } catch (e) { setQErr(friendlyErr(e)); } }, 300);
    return () => clearTimeout(t);
  }, [amt, spot]); // eslint-disable-line react-hooks/exhaustive-deps

  const avgUsd = q && q.pat > 0n && usd ? (Number(formatEther(wei)) * usd) / Number(formatEther(q.pat)) : 0;
  const impact = avgUsd && priceUsd ? (avgUsd / priceUsd - 1) * 100 : 0;

  const doConnect = async () => {
    try { const a = await connect(); await switchTo("rh"); setMe(a); setMsg(null); return a; }
    catch (e) { setMsg({ ok: false, t: friendlyErr(e) }); throw e; }
  };

  const go = async () => {
    setMsg(null);
    if (!ok) { setMsg({ ok: false, t: "Check the risk box above first." }); return; }
    if (wei <= 0n) { setMsg({ ok: false, t: "Enter how much ETH you want to spend." }); return; }
    setBusy(true);
    try {
      setStep("Connect wallet…");
      const a = me ?? (await doConnect());
      await switchTo("rh"); setMe(a);
      const have = await R.ethBalance(a);
      if (have < wei) throw new Error(`Not enough ETH on Robinhood Chain. You have ${eth(have)}, need ${eth(wei)} plus a little for the fee.`);
      setStep("Getting the latest price…");
      const fresh = await R.quote(wei);
      const { data, minPat } = R.buildBuy(fresh, BigInt(Math.floor(Date.now() / 1000) + 1200));
      const w = createWalletClient({ account: a, chain: robinhood, transport: custom(getEth() ?? (await requireEth())) });
      setStep("Confirm in your wallet…");
      const h = await w.sendTransaction({ account: a, chain: robinhood, to: R.UR, data, value: wei });
      setStep("Waiting for Robinhood Chain…");
      const r = await pub.rh.waitForTransactionReceipt({ hash: h });
      if (r.status !== "success") throw new Error("The buy did not go through (price moved more than 3%). No PAT was bought; only the network fee was used.");
      setMsg({ ok: true, t: `Bought about ${pat(fresh.pat)} PAT (at least ${pat(minPat)})`, h });
      load();
    } catch (e) { setMsg({ ok: false, t: friendlyErr(e) }); }
    setStep(""); setBusy(false);
  };
  const canSubmit = !busy && wei > 0n;

  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">ROBINHOOD</span>
          <button className="pd-wallet" onClick={() => doConnect().catch(() => {})}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>PATRON</h1><p>$PAT</p></div>
          <Art />
          <div className="pd-card-h"><h1>{fmtUsd(priceUsd)}</h1><p>PAT on Robinhood Chain{spot ? ` · ${spot.ethPerPat.toFixed(8).replace(/0+$/, "")} ETH` : ""}</p></div>
          <div className="br-row" style={{ marginTop: 14, color: "#ccc" }}><small>Market</small><small>Uniswap PAT / NVDA</small></div>
          <div className="br-row" style={{ color: "#ccc" }}><small>1 ETH buys about</small><small>{spot ? `${Math.round(1 / spot.ethPerPat).toLocaleString("en-US")} PAT at today’s price` : "…"}</small></div>
        </section>
        <section className="pv-card">
          <small>How much ETH do you want to spend?</small>
          <div className="pd-tabs">{[5, 10, 25, 100].map((d) => <button key={d} onClick={() => setAmt(ethFor(d))}>${d}</button>)}</div>
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(",", "."))} /><span>ETH</span></div>
          {me && <div className="br-row"><small>Your ETH on Robinhood Chain</small><small>{eth(bal.eth)}</small></div>}
          {me && <div className="br-row"><small>Your PAT on Robinhood Chain</small><small>{pat(bal.pat, 4)}</small></div>}
          <div className="br-row"><small>You pay</small><span style={{ textAlign: "right" }}><b>{wei > 0n && usd ? fmtUsd(Number(formatEther(wei)) * usd) : "…"}</b><br /><small>{wei > 0n ? eth(wei) : ""}</small></span></div>
          <div className="br-row"><small>You get about</small><span style={{ textAlign: "right" }}><b>{q ? `${pat(q.pat)} PAT` : wei > 0n && !qErr ? "…" : "—"}</b>{avgUsd > 0 && <><br /><small>{fmtUsd(avgUsd)} per PAT{impact > 1 ? ` · ${impact.toFixed(1)}% above market` : ""}</small></>}</span></div>
          {impact > 10 && <div className="pd-err">Large buy for this market: the price moves up {impact.toFixed(0)}% while you buy. A smaller amount gets a better price.</div>}
          {qErr && wei > 0n && <div className="pd-err">Quote failed: {qErr}</div>}
          <ResidencyCheck />
          {!ok && <small className="pd-fine">Check the box above, then tap Buy — your wallet will ask you to confirm on Robinhood Chain.</small>}
          <button className="pd-buy" disabled={!canSubmit} onClick={go}>
            {busy ? step || "Confirm in your wallet…" : `Buy ${q ? pat(q.pat, 0) + " " : ""}PAT${wei > 0n && usd ? ` for ${fmtUsd(Number(formatEther(wei)) * usd)}` : ""}`}</button>
          {msg && <div className={msg.ok ? "pv-ok" : "pd-err"}>{msg.t}{msg.h && <> · <a href={`${EXP}/tx/${msg.h}`} target="_blank" rel="noreferrer">tx ↗</a></>}</div>}
        </section>
        <p className="pd-fine">One tap, one signature: your ETH is swapped to NVDA and then to PAT in the Uniswap PAT/NVDA pool on Robinhood Chain, and the PAT is sent to your wallet. If the price moves more than 3% before it lands, nothing is bought. You need ETH on Robinhood Chain (chain 4663) plus a little for the fee. Price is read live from the pool. Holding PAT on Sei instead? <a href="/pat/">Buy on Sei</a> · <a href="/bridge/">Bridge</a>. Token <a href={`${EXP}/token/${R.PAT}`} target="_blank" rel="noreferrer">{R.PAT.slice(0, 10)}… ↗</a> · <a href={`https://www.geckoterminal.com/robinhood/pools/${R.POOL_ID}`} target="_blank" rel="noreferrer">Chart ↗</a></p>
      </main>
    </div>
  );
}
