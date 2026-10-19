"use client";
import { useEffect, useMemo, useState } from "react";
import { formatEther, parseEther, type Address } from "viem";
import * as S from "@/lib/strategyVaults";
import { NET, isTestnet, explorerTx, explorerAddr } from "@/lib/network";

/* PATRON Vault: real on-chain strategy vaults (PatronStrategyVault) on the PATRON Edition 0 curve.
   NAV, trades and charts are read from the contracts; the keeper log (reasons + tx links) comes from the keeper job. */
const NAMES = S.META;
const f4 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const sei = (v: bigint) => f4(Number(formatEther(v)));
const pct = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
const ago = (t: number) => { const s = Math.max(0, Math.floor(Date.now() / 1000 - t)); return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };
const KIND = ["checkpoint", "Buy", "Sell", "Deposit", "Withdraw"];
const LABEL = NET.labelJa;

function stats(v: S.VaultView) {
  const series = [...v.recs.map((r) => Number(r.ppsNano) / 1e9), Number(v.pps) / 1e18];
  let peak = series[0] || 1, dd = 0;
  for (const x of series) { peak = Math.max(peak, x); dd = Math.max(dd, (peak - x) / peak); }
  const trades = v.recs.filter((r) => r.kind === 1 || r.kind === 2);
  return { series, ret: ((Number(v.pps) / 1e18) - 1) * 100, dd: dd * 100, trades: trades.length, last: trades.length ? trades[trades.length - 1].time : 0 };
}

function Spark({ d, w = 120, h = 34, big = false }: { d: number[]; w?: number; h?: number; big?: boolean }) {
  const pts0 = d.length > 1 ? d : [d[0] ?? 1, d[0] ?? 1];
  const mn = Math.min(...pts0), mx = Math.max(...pts0);
  const pts = pts0.map((v, i) => `${(i / (pts0.length - 1)) * w},${h - ((v - mn) / (mx - mn || 1)) * (h - 4) - 2}`).join(" ");
  const col = pts0[pts0.length - 1] >= pts0[0] ? "#1a8f4c" : "#ff0047";
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="pv-spark"><polyline points={pts} fill="none" stroke={col} strokeWidth={big ? 1.6 : 1.4} vectorEffect="non-scaling-stroke" />{big && <polygon points={`0,${h} ${pts} ${w},${h}`} fill={col} opacity=".08" />}</svg>;
}
const Dot = ({ on }: { on: boolean }) => <i className="pv-dot" style={{ background: on ? "#1a8f4c" : "#bbb", boxShadow: "none" }} />;

export function Vault() {
  const [amt, setAmt] = useState("0.05");
  const [sid, setSid] = useState(NET.vaults[0]?.id || "");
  const [confirm, setConfirm] = useState(false);
  const [user, setUser] = useState<Address | null>(null);
  const [vs, setVs] = useState<S.VaultView[] | null>(null);
  const [log, setLog] = useState<S.KeeperEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ t: string; h?: string; err?: boolean } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const refresh = async (u = user) => { try { setVs(await S.readAll(u)); setErr(null); } catch (e) { setErr("読み込みに失敗しました: " + (e as Error).message.split("\n")[0]); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); const t = setInterval(() => refresh(), 10000); return () => clearInterval(t); }, [user]);
  useEffect(() => { S.readKeeperLog().then(setLog); const t = setInterval(() => S.readKeeperLog().then(setLog), 60000); return () => clearInterval(t); }, []);
  const run = async (label: string, f: () => Promise<string>) => {
    setBusy(label); setNote(null);
    try { const h = await f(); setNote({ t: `${label}: 完了`, h }); await refresh(); }
    catch (e) { setNote({ t: (e as Error).message.split("\n")[0], err: true }); }
    setBusy(null);
  };
  const doConnect = async () => { try { const a = await S.connect(); setUser(a); refresh(a); } catch (e) { setNote({ t: (e as Error).message, err: true }); } };

  const rows = useMemo(() => (vs || []).map((v) => ({ v, m: NAMES[v.id], s: stats(v) })), [vs]);
  const board = [...rows].sort((a, b) => b.s.ret - a.s.ret);
  const chosen = rows.find((r) => r.v.id === sid);
  const pos = rows.filter((r) => r.v.mine > 0n);
  const tvl = rows.reduce((s, r) => s + r.v.nav, 0n);
  let wei = 0n; try { wei = parseEther(amt || "0"); } catch {}
  const feed = useMemo(() => {
    const real = log.filter((e) => e.tx && !e.checkpoint).slice(-8).reverse();
    if (real.length) return real.map((e) => ({ k: e.tx!, name: NAMES[e.vault]?.name || e.vault, txt: `${e.decision === "buy" ? "bought" : "sold"} ${e.amount} PATRON @ ${f4(e.price)} SEI`, why: e.why, ago: ago(Date.parse(e.t) / 1000), tx: e.tx }));
    return rows.flatMap((r) => r.v.recs.map((x) => ({ r, x }))).filter(({ x }) => x.kind === 1 || x.kind === 2).sort((a, b) => b.x.time - a.x.time).slice(0, 8)
      .map(({ r, x }) => ({ k: r.v.id + x.time, name: r.m.name, txt: `${KIND[x.kind].toLowerCase()} ${x.amount} PATRON for ${f4(Number(x.seiGwei) / 1e9)} SEI`, why: "", ago: ago(x.time), tx: undefined as string | undefined }));
  }, [log, rows]);
  const lastRun = log.length ? log[log.length - 1].t : null;
  const d = detail ? rows.find((r) => r.v.id === detail) : null;

  if (!NET.vaults.length) return <section id="vault" className="pv"><div className="pv-disc">Vault is not deployed on this network yet.</div></section>;
  return (
    <section id="vault" className="pv">
      <div className="pv-disc">{LABEL} · {isTestnet ? "試し用のネットワークで、お金の価値はありません。" : ""} 自動売買は本当にブロックチェーン上で動いています（Sei {isTestnet ? "testnet" : "mainnet"}）。数字はすべて契約から読み取った実際の値です。投資の助言ではありません。本番の前に法律の確認が必要です。</div>
      {err && <div className="pd-err">{err}</div>}

      <div className="pv-grid2">
        <div className="pv-card">
          <div className="pv-h"><h3>SEIを預ける</h3><span className="pd-demo live">{NET.label}</span></div>
          <label className="pv-lab">Amount</label>
          <div className="pv-inp"><input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} /><span>SEI</span></div>
          <div className="pv-quick">{["0.02", "0.05", "0.1"].map((v) => <button key={v} onClick={() => setAmt(v)}>{v}</button>)}<span>{NET.faucet && <a href={NET.faucet} target="_blank" rel="noreferrer">テスト用SEIをもらう ↗</a>}</span></div>
          <label className="pv-lab">Strategy</label>
          <div className="pv-pick">
            {rows.map(({ v, m, s }) => (
              <button key={v.id} className={sid === v.id ? "on" : ""} onClick={() => setSid(v.id)}><Dot on={!v.paused} /><b>{m.name}</b><em className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</em></button>
            ))}
            {!vs && <p className="pv-mut">読み込み中…</p>}
          </div>
          {!user ? <button className="pd-buy" onClick={doConnect}>Connect wallet</button>
            : <button className="pd-buy" disabled={wei < 1000000000000000n || !!busy} onClick={() => setConfirm(true)}>{wei < 1000000000000000n ? "0.001 SEI以上" : "内容を確認"}</button>}
          {note && <div className={note.err ? "pd-err" : "pv-ok"}>{note.t}{note.h && <> · <a href={explorerTx(note.h)} target="_blank" rel="noreferrer">記録を見る ↗</a></>}</div>}
        </div>

        <div className="pv-card">
          <div className="pv-h"><h3>あなたの預け入れ</h3><span className="pv-mut">on-chain · TVL {sei(tvl)} SEI</span></div>
          {pos.length === 0 && <p className="pv-mut">{user ? "まだ預けていません。" : "ウォレットをつなぐと表示されます。"}</p>}
          {pos.map(({ v, m }) => (
            <div key={v.id} className="pv-pos">
              <div><b>{m.name}</b><small><Dot on={!v.paused} />{v.tok} PATRON + {sei(v.sei)} SEI in vault</small></div>
              <div className="r"><b>{sei(v.mineValue)} SEI</b><small>今の価値（売却した場合）</small></div>
              <button className="pv-wd" disabled={!!busy} onClick={() => run("引き出し", () => S.withdraw(v.address, v.mine))}>{busy === "引き出し" ? "…" : "全部引き出す"}</button>
            </div>))}
          <div className="pv-h" style={{ marginTop: 14 }}><h3>Live activity</h3><span className="pv-live"><Dot on />{lastRun ? `keeper ${ago(Date.parse(lastRun) / 1000)} ago` : "on-chain"}</span></div>
          <ul className="pv-feed">{feed.map((f) => <li key={f.k} title={f.why}><b>{f.name}</b> {f.txt}{f.tx && <> · <a href={explorerTx(f.tx)} target="_blank" rel="noreferrer">tx ↗</a></>}<span>{f.ago}</span></li>)}
            {!feed.length && <li>まだ取引はありません。</li>}</ul>
        </div>
      </div>

      <div className="pv-h" style={{ marginTop: 26 }}><h2 className="pv-h2">Auto strategies</h2></div>
      <div className="pv-legend"><span><Dot on />稼働中（keeperが定期的に売買）</span><span>1口の価値（NAV / share）の推移</span></div>
      <div className="pv-tiles">
        {rows.map(({ v, m, s }) => (
          <button key={v.id} className="pv-tile" onClick={() => setDetail(v.id)}>
            <div className="pv-h"><b>{m.name}</b><span className="pv-st"><Dot on={!v.paused} />{v.paused ? "Paused" : "Live"}</span></div>
            <small className="pv-mut">{m.agent} · PATRON/SEI</small>
            <div className={"pv-net " + (s.ret >= 0 ? "up" : "dn")}>{pct(s.ret)}<small>NAV/SHARE</small></div>
            <Spark d={s.series} />
            <div className="pv-kpi"><span>NAV<b>{sei(v.nav)}</b></span><span>Max DD<b>{s.dd.toFixed(2)}%</b></span><span>Trades<b>{s.trades}</b></span></div>
          </button>
        ))}
      </div>

      <div className="pv-card" style={{ marginTop: 20 }}>
        <div className="pv-h"><h3>Leaderboard</h3><span className="pv-mut">1口の価値の伸び順 · on-chain</span></div>
        <table className="pv-board"><thead><tr><th>#</th><th>Strategy</th><th>NAV (SEI)</th><th>Return</th><th>DD</th><th>Trades</th></tr></thead><tbody>
          {board.map(({ v, m, s }, i) => <tr key={v.id} onClick={() => setDetail(v.id)}><td>{i + 1}</td><td><b>{m.name}</b></td><td>{sei(v.nav)}</td><td className={s.ret >= 0 ? "up" : "dn"}>{pct(s.ret)}</td><td>{s.dd.toFixed(2)}%</td><td>{s.trades}</td></tr>)}
        </tbody></table>
      </div>

      {confirm && chosen && (
        <div className="pv-modal" onClick={() => setConfirm(false)}>
          <div className="pv-card pv-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>預け入れの確認</h3><span className="pd-demo live">{NET.label}</span></div>
            <div className="pv-big">{amt} <small>SEI</small></div>
            <div className="pv-row"><span>Strategy</span><b>{chosen.m.name}</b></div>
            <div className="pv-row"><span>ルール</span><b style={{ textAlign: "right", maxWidth: 220 }}>{chosen.m.ja}</b></div>
            <div className="pv-row"><span>Max drawdown</span><b>{chosen.s.dd.toFixed(2)}%</b></div>
            <p className="pv-warn">{LABEL}。keeperはPATRONの売り買いしかできず、あなたのお金を引き出すことはできません。引き出しはいつでもあなただけができます。投資の助言ではありません。</p>
            <div className="pv-btns"><button className="pd-sec" onClick={() => setConfirm(false)}>Cancel</button>
              <button className="pd-buy" disabled={!!busy} onClick={async () => { setConfirm(false); await run("預け入れ", () => S.deposit(chosen.v.address, wei)); }}>預ける</button></div>
          </div>
        </div>
      )}
      {d && (
        <div className="pv-modal" onClick={() => setDetail(null)}>
          <div className="pv-card pv-sheet wide" onClick={(e) => e.stopPropagation()}>
            <div className="pv-h"><h3>{d.m.name}</h3><button className="pv-x" onClick={() => setDetail(null)}>×</button></div>
            <small className="pv-mut"><Dot on={!d.v.paused} />{d.m.agent} · {d.m.rule}</small>
            <div className={"pv-net big " + (d.s.ret >= 0 ? "up" : "dn")}>{pct(d.s.ret)}<small>NAV/SHARE</small></div>
            <div className="pv-curve"><Spark d={d.s.series} w={400} h={140} big /></div>
            <div className="pv-kpi"><span>NAV<b>{sei(d.v.nav)} SEI</b></span><span>Holdings<b>{d.v.tok} PATRON + {sei(d.v.sei)} SEI</b></span><span>Trades<b>{d.s.trades}</b></span></div>
            <h4 className="pv-lab">History (on-chain)</h4>
            <table className="pv-board"><tbody>{[...d.v.recs].reverse().slice(0, 12).map((r, i) => <tr key={i}><td>{new Date(r.time * 1000).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td>{KIND[r.kind]}</td><td>{r.kind === 1 || r.kind === 2 ? `${r.amount} PATRON` : ""}</td><td>{r.seiGwei ? f4(Number(r.seiGwei) / 1e9) + " SEI" : ""}</td><td>NAV {f4(Number(r.navGwei) / 1e9)}</td></tr>)}</tbody></table>
            <small className="pv-mut">Vault <a href={explorerAddr(d.v.address)} target="_blank" rel="noreferrer">{d.v.address.slice(0, 10)}… ↗</a> · keeper <a href={explorerAddr(d.v.keeper)} target="_blank" rel="noreferrer">{d.v.keeper.slice(0, 10)}… ↗</a></small>
            <button className="pd-buy" onClick={() => { setSid(d.v.id); setDetail(null); document.getElementById("vault")?.scrollIntoView({ behavior: "smooth" }); }} disabled={d.v.paused}>{d.v.paused ? "停止中" : "この戦略に預ける"}</button>
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
        <div className="pd-actions"><span className="pd-demo live">{NET.label}</span><a className="pd-wallet" href={drop}>PATRON Edition 0</a></div>
      </header>
      <main className="pv-main">
        {isTestnet && <div className="pd-tn" role="note"><b>テストネット</b> 試し用のネットワークです。お金の価値はありません。</div>}
        <section className="pd-card pv-hero">
          <div className="pd-card-h"><h1>PATRON Vault</h1><p>SEIを預けて、戦略を選ぶと自動で売買します</p></div>
          <span className="pd-chip">{NET.label}</span>
        </section>
        <Vault />
        <p className="pd-foot">PatronStrategyVault × {NET.vaults.length} · market <a href={explorerAddr(NET.market)} target="_blank" rel="noreferrer">{NET.market.slice(0, 10)}… ↗</a> · token <a href={explorerAddr(NET.token)} target="_blank" rel="noreferrer">{NET.token.slice(0, 10)}… ↗</a></p>
        {home && <p className="pd-foot"><a href={home} target="_blank" rel="noreferrer">patron.red →</a></p>}
      </main>
    </div>
  );
}
