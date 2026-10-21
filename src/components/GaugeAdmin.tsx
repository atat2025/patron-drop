"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Mustache from "./Mustache";
import * as V from "@/lib/vaultChain";
import { readGauge, adminWrite, yen, GAUGE, type GaugeData } from "@/lib/gauge";
import { LiquidityGauge } from "./DropMeters";

export default function GaugeAdmin() {
  const [d, setD] = useState<GaugeData | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [stages, setStages] = useState("");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => readGauge().then((g) => { setD(g); setStages((s) => s || g.stages.join(",")); setAmt((a) => a || String(g.manualJPY)); });
  useEffect(() => { load(); }, []);
  const isOwner = !!me && !!d?.owner && me.toLowerCase() === d.owner.toLowerCase();
  const run = async (fn: "setStages" | "setManualAmount") => {
    setBusy(true); setMsg(null);
    try {
      const args = fn === "setStages" ? [stages.split(",").map((x) => BigInt(x.replace(/[^\d]/g, "")))] : [BigInt(amt.replace(/[^\d]/g, "") || "0"), note];
      const h = await adminWrite(fn, args);
      setMsg({ ok: true, t: "Updated · tx " + h.slice(0, 10) + "…" }); setNote(""); await load();
    } catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); }
    setBusy(false);
  };
  return (
    <div className="pd">
      <header className="pd-top">
        <Link className="pd-brand" href="/"><Mustache size={22} /><span>patron<i>_</i></span></Link>
        <div className="pd-actions"><span className="pd-demo live">TESTNET · ADMIN</span>
          <button className="pd-wallet" onClick={() => V.connect().then(setMe).catch((e) => setMsg({ ok: false, t: e.message }))}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect Wallet"}</button></div>
      </header>
      <main className="pd-main">
        <div className="pd-card"><div className="pd-card-h"><h1>Gauge admin</h1><p>GaugeConfig · Sei testnet</p></div></div>
        <div className="pd-info">Only the contract owner can sign updates. Every change is recorded on-chain and shown publicly as change history. The operator-added amount is always shown separately as the operator-added amount.
          <br /><small>Contract <a href={`https://seitrace.com/address/${GAUGE}?chain=atlantic-2`} target="_blank" rel="noreferrer">{GAUGE.slice(0, 10)}…</a> · owner {d?.owner ? d.owner.slice(0, 10) + "…" : "—"}</small></div>
        {me && !isOwner && <div className="kl-err">This wallet is not the owner.</div>}
        <div className="dm-g ad">
          <div className="dm-h"><span>Stages (JPY, ascending, comma-separated)</span></div>
          <input value={stages} onChange={(e) => setStages(e.target.value)} placeholder="300000000,500000000" />
          <small>{stages.split(",").filter(Boolean).map((x) => yen(Number(x.replace(/[^\d]/g, "")))).join(" / ")}</small>
          <button className="pd-buy" disabled={!isOwner || busy} onClick={() => run("setStages")}>Sign: update stages</button>
        </div>
        <div className="dm-g ad">
          <div className="dm-h"><span>Operator-added amount (JPY)</span><small>Current {d ? yen(d.manualJPY) : "—"}</small></div>
          <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="0" inputMode="numeric" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Public note, e.g. OTC commitment from …" />
          <button className="pd-buy" disabled={!isOwner || busy || !note} onClick={() => run("setManualAmount")}>Sign: update operator amount</button>
          <small>A public note is required.</small>
        </div>
        {msg && <div className={msg.ok ? "dm-g" : "kl-err"}>{msg.t}</div>}
        <h3 className="ad-h">Public preview</h3>
        <LiquidityGauge />
      </main>
    </div>
  );
}
