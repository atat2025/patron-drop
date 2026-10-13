"use client";
import { useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import * as V from "@/lib/vaultChain";

// DEMO DATA ONLY: fictional strategies, simulated P&L. No real funds.
type Stage = "live" | "forward" | "candidate" | "parked";
type Strat = { id: string; name: string; agent: string; market: string; stage: Stage; net: number; pf: number; dd: number; trades: number; seed: number };
const STAGE: Record<Stage, [string, string]> = { live: ["Live", "#1a8f4c"], forward: ["Forward testing", "#2f6fed"], candidate: ["Candidate", "#e0a800"], parked: ["Parked", "#9a9aa5"] };
const STRATS: Strat[] = [
  { id: "s1", name: "Night Owl Momentum", agent: "Agent A · LLM-1 (demo)", market: "SEI/USDC perp", stage: "live", net: 18.4, pf: 1.92, dd: 6.1, trades: 214, seed: 3 },
  { id: "s2", name: "Mean Revert Lite", agent: "Agent B · LLM-2 (demo)", market: "PAT/SEI spot", stage: "live", net: 9.7, pf: 1.41, dd: 4.3, trades: 512, seed: 7 },
  { id: "s3", name: "Funding Harvester", agent: "Agent C · rules+LLM (demo)", market: "BTC perp", stage: "forward", net: 5.2, pf: 1.33, dd: 2.8, trades: 88, seed: 11 },
  { id: "s4", name: "Breakout Scout", agent: "Agent D · LLM-3 (demo)", market: "ETH perp", stage: "forward", net: -2.1, pf: 0.91, dd: 9.4, trades: 61, seed: 5 },
  { id: "s5", name: "Range Weaver", agent: "Agent E · LLM-1 (demo)", market: "SEI/USDC perp", stage: "candidate", net: 12.0, pf: 1.58, dd: 7.7, trades: 140, seed: 13 },
  { id: "s6", name: "Volatility Sleeper", agent: "Agent F · LLM-2 (demo)", market: "PAT/SEI spot", stage: "parked", net: -6.8, pf: 0.72, dd: 14.2, trades: 39, seed: 17 },
];
const curve = (s: Strat, n = 40) => { let v = 100, r = s.seed; const out = [v]; for (let i = 1; i < n; i++) { r = (r * 9301 + 49297) % 233280; v += (r / 233280 - 0.5) * 4 + s.net / n; out.push(v); } return out; };
function Spark({ s, w = 120, h = 34, big = false }: { s: Strat; w?: number; h?: number; big?: boolean }) {
  const d = curve(s, big ? 80 : 40); const mn = Math.min(...d), mx = Math.max(...d);
  const pts = d.map((v, i) => `${(i / (d.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(" ");
  const col = s.net >= 0 ? "#1a8f4c" : "#ff0047";
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pv-spark"><polyline points={pts} fill="none" stroke={col} strokeWidth={big ? 1.6 : 1.4} vectorEffect="non-scaling-stroke" />{big && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={col} opacity=".08" />}</svg>;
}
const Dot = ({ st }: { st: Stage }) => <i className="pv-dot" style={{ background: STAGE[st][1], boxShadow: "none" }} />;
const sidNum = (id: string) => Number(id.slice(1));
const fmtPat = (v: bigint) => Number(formatEther(v)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const FEED = ["opened long SEI/USDC", "closed PAT/SEI +0.8%", "trimmed ETH short", "took profit BTC +1.2%", "stopped out ETH −0.6%", "rebalanced PAT/SEI"];

export function Vault() {
  const [amt, setAmt] = useState("10000");
  const [sid, setSid] = useState("s1");
  const [confirm, setConfirm] = useState(false);
  const [user, setUser] = useState<Address | null>(null);
  const [ch, setCh] = useState<Awaited<ReturnType<typeof V.readVault>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ t: string; h?: string; err?: boolean } | null>(null);
  const [buyAmt, setBuyAmt] = useState("100000");
  const ids = STRATS.map((x) => sidNum(x.id));
  const refresh = async (u = user) => { if (V.enabled) try { setCh(await V.readVault(u, ids)); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); const t = setInterval(() => refresh(), 8000); return () => clearInterval(t); }, [user]);
  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(label); setNote(null);
    try { const h = await f(); setNote({ t: `${label}: confirmed`, h }); await refresh(); }
    catch (e) { setNote({ t: (e as Error).message.split("\n")[0], err: true }); }
    setBusy(null);
  };
  const doConnect = async () => { try { const a = await V.connect(); setUser(a); refresh(a); } catch (e) { setNote({ t: (e as Error).message, err: true }); } };
  const [detail, setDetail] = useState<Strat | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 2500); return () => clearInterval(t); }, []);
  const feed = useMemo(() => Array.from({ length: 5 }, (_, i) => { const k = tick + i; const s = STRATS[k % STRATS.length]; return { s, txt: FEED[(k * 7) % FEED.length], ago: i * 3 + 1 }; }), [tick]);
  const board = [...STRATS].sort((a, b) => b.net - a.net);
  const chosen = STRATS.find((s) => s.id === sid)!;
  const pos = STRATS.map((x, i) => ({ s: x, amt: ch?.per[i] ?? 0n })).filter((p) => p.amt > 0n);
  const pnl = (amt: bigint, x: Strat) => Number(formatEther(amt)) * (x.net / 100) * 0.35; // DEMO P&L, not on-chain
  const n = Number(amt) || 0;
  let wei = 0n; try { wei = parseEther(amt || "0"); } catch {}
  const needApprove = !!ch && ch.allow < wei;

  return (
    <section id="vault" className="pv">
      <div className="pv-disc">{V.isTestnet ? "SEI TESTNET" : "SEI MAINNET"} · Prototype. Not financial advice. Regulatory review required before launch. Deposits are real on-chain custody in PatronVault ({V.isTestnet ? "testnet PAT, no value" : "not audited"}); strategies, P&L and the activity feed are DEMO, the strategy choice only tags your deposit.</div>

      <div className="pv-grid2">
        <div className="pv-card">
          <div className="pv-h"><h3>Deposit PATRON</h3><span className="pd-demo live">{V.isTestnet ? "TESTNET" : "MAINNET"}</span></div>
          <label className="pv-lab">Amount</label>
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} /><span>PAT</span></div>
          <div className="pv-quick">{[1000, 10000, 50000].map((v) => <button key={v} onClick={() => setAmt(String(v))}>{v.toLocaleString()}</button>)}<span>{user ? <>Wallet {ch ? fmtPat(ch.wallet) : "…"} PAT · <a onClick={() => ch && setAmt(formatEther(ch.wallet))}>max</a></> : "Connect to see balance"}</span></div>
          <label className="pv-lab">Strategy</label>
          <div className="pv-pick">
            {STRATS.filter((s) => s.stage !== "parked").map((s) => (
              <button key={s.id} className={sid === s.id ? "on" : ""} onClick={() => setSid(s.id)}><Dot st={s.stage} /><b>{s.name}</b><em className={s.net >= 0 ? "up" : "dn"}>{pct(s.net)}</em></button>
            ))}
          </div>
          {!user ? <button className="pd-buy" onClick={doConnect}>Connect wallet</button>
            : <button className="pd-buy" disabled={n <= 0 || !!busy || (ch ? ch.wallet < wei : true)} onClick={() => setConfirm(true)}>{ch && ch.wallet < wei ? "Not enough PAT" : "Review deposit"}</button>}
          {V.isTestnet && <div className="pv-get"><b>Need testnet PAT?</b> Buy on the PATRON curve (Sei testnet SEI, no value). <a href="https://docs.sei.io/learn/faucet" target="_blank" rel="noreferrer">SEI faucet ↗</a>
            <div className="pv-quick"><div className="pv-inp sm"><input inputMode="decimal" value={buyAmt} onChange={(e) => setBuyAmt(e.target.value.replace(/[^0-9.]/g, ""))} /><span>PAT</span></div>
              <button className="pd-sec sm" disabled={!!busy} onClick={() => user ? run("Buy PAT", () => V.buyPat(parseEther(buyAmt || "0"))) : doConnect()}>{busy === "Buy PAT" ? "Confirm in wallet…" : "Buy PAT"}</button></div></div>}
          {note && <div className={note.err ? "pd-err" : "pv-ok"}>{note.t}{note.h && <> · <a href={V.tx(note.h)} target="_blank" rel="noreferrer">view tx ↗</a></>}</div>}
        </div>

        <div className="pv-card">
          <div className="pv-h"><h3>Your deposits</h3><span className="pv-mut">on-chain · TVL {ch ? fmtPat(ch.tvl) : "…"} PAT</span></div>
          {user && ch && <div className="pv-row"><span>Your total in vault</span><b>{fmtPat(ch.mine)} PAT</b></div>}
          {pos.length === 0 && <p className="pv-mut">{user ? "No deposits yet." : "Connect your wallet to see deposits."}</p>}
          {pos.map((p) => { const s = p.s; const v = pnl(p.amt, s); return (
            <div key={s.id} className="pv-pos">
              <div><b>{s.name}</b><small><Dot st={s.stage} />{STAGE[s.stage][0]} · {s.market}</small></div>
              <div className="r"><b>{fmtPat(p.amt)} PAT</b><small className={v >= 0 ? "up" : "dn"}>{v >= 0 ? "+" : ""}{v.toFixed(0)} PAT · DEMO P&L</small></div>
              <button className="pv-wd" disabled={!!busy} onClick={() => run("Withdraw", () => V.withdraw(p.amt, sidNum(s.id)))}>{busy === "Withdraw" ? "…" : "Withdraw all"}</button>
            </div>); })}
          <div className="pv-h" style={{ marginTop: 14 }}><h3>Live activity</h3><span className="pv-live"><Dot st="live" />demo feed</span></div>
          <ul className="pv-feed">{feed.map((f, i) => <li key={`${tick}-${i}`}><Dot st={f.s.stage} /><b>{f.s.name}</b> {f.txt}<span>{f.ago}m</span></li>)}</ul>
        </div>
      </div>

      <div className="pv-h" style={{ marginTop: 26 }}><h2 className="pv-h2">Auto strategies</h2></div>
      <div className="pv-legend">{(Object.keys(STAGE) as Stage[]).map((k) => <span key={k}><Dot st={k} />{STAGE[k][0]}</span>)}</div>
      <div className="pv-tiles">
        {STRATS.map((s) => (
          <button key={s.id} className="pv-tile" onClick={() => setDetail(s)}>
            <div className="pv-h"><b>{s.name}</b><span className="pv-st"><Dot st={s.stage} />{STAGE[s.stage][0]}</span></div>
            <small className="pv-mut">{s.agent} · {s.market}</small>
            <div className={"pv-net " + (s.net >= 0 ? "up" : "dn")}>{pct(s.net)}<small>NET</small></div>
            <Spark s={s} />
            <div className="pv-kpi"><span>PF<b>{s.pf.toFixed(2)}</b></span><span>Max DD<b>{s.dd.toFixed(1)}%</b></span><span>Trades<b>{s.trades}</b></span></div>
          </button>
        ))}
      </div>

      <div className="pv-card" style={{ marginTop: 20 }}>
        <div className="pv-h"><h3>Leaderboard</h3><span className="pv-mut">by NET %, demo</span></div>
        <table className="pv-board"><thead><tr><th>#</th><th>Strategy</th><th>Stage</th><th>NET</th><th>PF</th><th>DD</th></tr></thead><tbody>
          {board.map((s, i) => <tr key={s.id} onClick={() => setDetail(s)}><td>{i + 1}</td><td><b>{s.name}</b></td><td><Dot st={s.stage} /></td><td className={s.net >= 0 ? "up" : "dn"}>{pct(s.net)}</td><td>{s.pf.toFixed(2)}</td><td>{s.dd.toFixed(1)}%</td></tr>)}
        </tbody></table>
      </div>

      {confirm && (
        <div className="pv-modal" onClick={() => setConfirm(false)}>
          <div className="pv-card pv-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>Confirm deposit</h3><span className="pd-demo live">{V.isTestnet ? "TESTNET" : "MAINNET"}</span></div>
            <div className="pv-big">{n.toLocaleString()} <small>PAT</small></div>
            <div className="pv-row"><span>Strategy</span><b>{chosen.name}</b></div>
            <div className="pv-row"><span>Stage</span><b><Dot st={chosen.stage} />{STAGE[chosen.stage][0]}</b></div>
            <div className="pv-row"><span>Max drawdown (hist.)</span><b>{chosen.dd}%</b></div>
            <p className="pv-warn">Prototype. Not financial advice. Regulatory review required before launch. Strategy is a tag only (DEMO), funds stay in the vault and only you can withdraw. {V.isTestnet ? "Sei testnet, no real value." : ""}</p>
            <div className="pv-btns"><button className="pd-sec" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="pd-buy" disabled={!!busy} onClick={async () => { setConfirm(false); if (needApprove) await run("Approve PAT", () => V.approve(wei)); await run("Deposit", () => V.deposit(wei, sidNum(sid))); }}>{needApprove ? "Approve + deposit" : "Deposit"}</button></div>
          </div>
        </div>
      )}
      {detail && (
        <div className="pv-modal" onClick={() => setDetail(null)}>
          <div className="pv-card pv-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>{detail.name}</h3><button className="pv-x" onClick={() => setDetail(null)}>×</button></div>
            <small className="pv-mut"><Dot st={detail.stage} />{STAGE[detail.stage][0]} · {detail.agent} · {detail.market}</small>
            <div className={"pv-net big " + (detail.net >= 0 ? "up" : "dn")}>{pct(detail.net)}<small>NET</small></div>
            <div className="pv-curve"><Spark s={detail} w={400} h={140} big /></div>
            <div className="pv-kpi"><span>Profit factor<b>{detail.pf.toFixed(2)}</b></span><span>Max DD<b>{detail.dd}%</b></span><span>Trades<b>{detail.trades}</b></span></div>
            <h4 className="pv-lab">History (demo)</h4>
            <table className="pv-board"><tbody>{Array.from({ length: 6 }, (_, i) => { const r = ((detail.seed * (i + 3) * 37) % 41) / 10 - 1.4; return <tr key={i}><td>Oct {12 - i}</td><td>{i % 2 ? "Short" : "Long"}</td><td>{detail.market}</td><td className={r >= 0 ? "up" : "dn"}>{r >= 0 ? "+" : ""}{r.toFixed(1)}%</td></tr>; })}</tbody></table>
            <button className="pd-buy" onClick={() => { setSid(detail.id); setDetail(null); document.getElementById("vault")?.scrollIntoView({ behavior: "smooth" }); }} disabled={detail.stage === "parked"}>{detail.stage === "parked" ? "Parked, not accepting deposits" : "Deposit into this strategy"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

import Mustache from "./Mustache";
export default function VaultPage({ home = "", drop = "../" }: { home?: string; drop?: string }) {
  return (
    <div className="pd">
      <header className="pd-top">
        <a className="pd-brand" href={drop}><Mustache size={22} /><span>patron<i>_</i></span></a>
        <div className="pd-actions"><span className="pd-demo live">{V.isTestnet ? "TESTNET" : "MAINNET"}</span><a className="pd-wallet" href={drop}>PATRON Edition 0</a></div>
      </header>
      <main className="pv-main">
        <section className="pd-card pv-hero">
          <div className="pd-card-h"><h1>PATRON Vault</h1><p>Deposit $PATRON into auto strategies</p></div>
          <span className="pd-chip">{V.isTestnet ? "TESTNET" : "MAINNET"}</span>
        </section>
        <Vault />
        <p className="pd-foot">PatronVault <a href={V.addr(V.VAULT)} target="_blank" rel="noreferrer">{V.VAULT.slice(0, 10)}… ↗</a> · token <a href={V.addr(V.TOKEN)} target="_blank" rel="noreferrer">{V.TOKEN.slice(0, 10)}… ↗</a></p>
        {home && <p className="pd-foot"><a href={home} target="_blank" rel="noreferrer">patron.red →</a></p>}
      </main>
    </div>
  );
}
