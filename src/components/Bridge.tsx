"use client";
import { useCallback, useEffect, useState } from "react";
import { formatEther, isAddress, parseEther, type Address } from "viem";
import Mustache from "./Mustache";
import * as B from "@/lib/bridge";

const fmt = (v?: bigint, d = 4) => (v === undefined ? "…" : Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: d }));

export default function BridgePage({ drop = "../" }: { drop?: string }) {
  const [src, setSrc] = useState<B.Side>("rh");
  const dst = B.other(src);
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<bigint>();
  const [gas, setGas] = useState<bigint>();
  const [amt, setAmt] = useState("");
  const [to, setTo] = useState("");
  const [fee, setFee] = useState<bigint>();
  const [needApprove, setNeedApprove] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ side: B.Side; hash: string } | null>(null);

  let wei = 0n; try { wei = amt ? parseEther(amt) : 0n; } catch { wei = -1n; }
  const toOk = isAddress(to);
  const valid = wei > 0n && toOk && (bal === undefined || wei <= bal);

  const refresh = useCallback(async () => {
    if (!me) return;
    setBal(undefined); setGas(undefined);
    try { const [b, g] = await Promise.all([B.balance(src, me), B.gasBalance(src, me)]); setBal(b); setGas(g); } catch {}
  }, [me, src]);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    setFee(undefined); setNeedApprove(false);
    if (!valid || wei <= 0n) return;
    const t = setTimeout(async () => {
      try { setFee((await B.quote(src, to as Address, wei)).nativeFee); } catch { setFee(undefined); }
      if (me) try { setNeedApprove(await B.needsApproval(src, me, wei)); } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [src, to, amt, me, valid]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => { setErr(null); try { const a = await B.connect(); setMe(a); if (!to) setTo(a); await B.switchTo(src); } catch (e) { setErr((e as Error).message.split("\n")[0]); } };
  const run = async (label: string, fn: () => Promise<unknown>) => { setBusy(label); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message.split("\n")[0]); } setBusy(""); refresh(); };
  const flip = () => { setSrc(dst); setDone(null); setErr(null); };

  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">MAINNET</span>
          <button className="pd-wallet" onClick={connect}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "Connect"}</button></div>
      </header>
      <main className="pd-main">
        <section className="pd-card">
          <div className="pd-card-h"><h1>Bridge PAT</h1><p>Robinhood Chain ⇄ Sei via LayerZero</p></div>
        </section>
        <section className="pv-card">
          <div className="br-row"><small>From</small><b>{B.SIDES[src].label}</b></div>
          <button className="pd-sec sm br-flip" onClick={flip} aria-label="Switch direction">⇅ Switch</button>
          <div className="br-row"><small>To</small><b>{B.SIDES[dst].label}</b></div>
        </section>
        <section className="pv-card">
          <div className="br-row"><small>Amount</small><small>Balance: {me ? `${fmt(bal)} PAT` : "—"}</small></div>
          <div className="pv-inp"><input inputMode="decimal" placeholder="0.0" value={amt} onChange={(e) => setAmt(e.target.value.replace(",", "."))} /><span>PAT</span></div>
          {me && bal !== undefined && bal > 0n && <div className="pv-quick"><button onClick={() => setAmt(formatEther(B.dust(bal)))}>Max</button></div>}
          <div className="br-row"><small>Recipient on {B.SIDES[dst].label}</small></div>
          <div className="pv-inp"><input className="br-addr" placeholder="0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} spellCheck={false} autoCapitalize="off" /></div>
          {to && !toOk && <div className="pd-err">Invalid address</div>}
          <div className="br-row"><small>LayerZero fee</small><small>{fee !== undefined ? `${fmt(fee, 6)} ${B.SIDES[src].gas}` : valid ? "…" : "—"}</small></div>
          {me && <div className="br-row"><small>Your {B.SIDES[src].gas} for gas</small><small>{fmt(gas, 6)}</small></div>}
          {!me ? <button className="pd-buy" onClick={connect}>Connect wallet</button>
            : needApprove ? <button className="pd-buy" disabled={!!busy || !valid} onClick={() => run("Approving…", async () => { await B.approve(src, wei); setNeedApprove(false); })}>{busy || "Approve PAT"}</button>
            : <button className="pd-buy" disabled={!!busy || !valid || fee === undefined} onClick={() => run("Confirm in wallet…", async () => { const h = await B.bridge(src, to as Address, wei); setDone({ side: src, hash: h }); setAmt(""); })}>{busy || `Bridge to ${B.SIDES[dst].label}`}</button>}
          {err && <div className="pd-err">{err}</div>}
          {done && <div className="pv-ok">Sent. Delivery usually takes a few minutes.<br />
            <a href={B.txUrl(done.side, done.hash)} target="_blank" rel="noreferrer">Source transaction ↗</a> · <a href={B.lzUrl(done.hash)} target="_blank" rel="noreferrer">LayerZero Scan ↗</a></div>}
        </section>
        <p className="pd-fine">Amounts are rounded down to 6 decimals. You pay the LayerZero fee in {B.SIDES[src].gas} on {B.SIDES[src].label}. Contract <a href={B.txUrl(src, "").replace("/tx/", "/address/") + B.BRIDGE} target="_blank" rel="noreferrer">{B.BRIDGE.slice(0, 10)}… ↗</a></p>
      </main>
    </div>
  );
}
