"use client";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/patronChain";

/** かんたんログイン: お名前 + 暗証番号6けた。鍵はサーバーで暗号化して保管（Sei テストネット専用）。 */
const API = process.env.NEXT_PUBLIC_EASY_API || "https://patron-login-api.vercel.app/api";
const TK = "patron-easy-token";
const big = { fontSize: 22, lineHeight: 1.5 } as const;
const input = { ...big, width: "100%", padding: "14px 12px", borderRadius: 12, border: "2px solid #ccc", margin: "6px 0 14px", boxSizing: "border-box" } as const;

async function call(path: string, body?: object, token?: string) {
  const r = await fetch(`${API}/${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "うまくいきませんでした");
  return j;
}
interface Me { address: string; sei: string; patron: number; musdc: number }

export default function EasyLogin({ onAddr, onDone }: { onAddr: (a: string | null) => void; onDone: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [tab, setTab] = useState<"login" | "new">("login");
  const [id, setId] = useState(""); const [pin, setPin] = useState("");
  const [me, setMe] = useState<Me | null>(null); const [n, setN] = useState(1);
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<{ msg: string; tx?: string } | null>(null);
  useEffect(() => { const t = localStorage.getItem(TK); if (t) setToken(t); }, []);
  useEffect(() => { if (!token) return; call("me", undefined, token).then((m) => { setMe(m); onAddr(m.address); }).catch(() => { localStorage.removeItem(TK); setToken(null); }); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (label: string, f: () => Promise<void>) => { setBusy(label); setErr(null); setOk(null); try { await f(); } catch (e) { setErr((e as Error).message); } setBusy(null); };
  const enter = () => run(tab === "new" ? "とうろく中…" : "ログイン中…", async () => {
    const r = await call(tab === "new" ? "register" : "login", { id, pin });
    localStorage.setItem(TK, r.token); setToken(r.token); setPin("");
  });
  const trade = (kind: "buy" | "sell") => run(kind === "buy" ? "買っています…（30秒ほど）" : "売っています…", async () => {
    const r = await call(kind, { n, pay: "mUSDC" }, token!);
    setOk({ msg: kind === "buy" ? `${n}枚 買いました` : `${n}枚 売りました`, tx: r.tx });
    setMe(await call("me", undefined, token!)); onDone();
  });
  const logout = () => { localStorage.removeItem(TK); setTab("login"); setToken(null); setMe(null); onAddr(null); };
  const btn = (bg = "#ff4a9f") => ({ ...big, width: "100%", padding: "16px", borderRadius: 14, border: 0, background: bg, color: "#fff", fontWeight: 700, margin: "6px 0", cursor: "pointer" } as const);

  return <div className="easy" style={{ ...big, fontSize: 18 }}>
    <div className="pd-mh" style={{ fontSize: 24 }}>かんたんログイン</div>
    <div role="note" style={{ background: "#fff3c4", border: "2px solid #e0b000", borderRadius: 12, padding: "10px 12px", margin: "8px 0 14px", fontSize: 18, fontWeight: 700 }}>
      テストネット専用・実際のお金は使えません
    </div>
    {!token ? <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...btn(tab === "login" ? "#333" : "#bbb"), margin: 0 }} onClick={() => setTab("login")}>ログイン</button>
        <button style={{ ...btn(tab === "new" ? "#333" : "#bbb"), margin: 0 }} onClick={() => setTab("new")}>はじめての方</button>
      </div>
      <label>お名前（あいことば）<input style={input} value={id} onChange={(e) => setId(e.target.value)} placeholder="例：さくら たろう" autoComplete="username" /></label>
      <label>暗証番号（数字6けた）<input style={{ ...input, letterSpacing: 8 }} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" placeholder="●●●●●●" autoComplete={tab === "new" ? "new-password" : "current-password"} /></label>
      {tab === "new" && <p style={{ fontSize: 16, margin: "0 0 8px" }}>お名前と暗証番号は、紙に書いて大切に保管してください。</p>}
      <button style={btn()} disabled={!!busy || id.trim().length < 2 || pin.length !== 6} onClick={enter}>{busy || (tab === "new" ? "とうろくする" : "ログインする")}</button>
    </> : <>
      {me ? <div style={{ margin: "4px 0 12px" }}>
        <div>もっている PATRON：<b style={{ fontSize: 28 }}>{me.patron}</b> 枚</div>
        <div style={{ fontSize: 15, color: "#666" }}>テスト用ドル {me.musdc.toFixed(2)} ・ ガス代用 SEI {Number(me.sei).toFixed(3)}</div>
      </div> : <p>読みこみ中…</p>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "8px 0" }}>
        <button style={{ ...btn("#999"), width: 64 }} onClick={() => setN(Math.max(1, n - 1))}>−</button>
        <b style={{ fontSize: 32 }}>{n} 枚</b>
        <button style={{ ...btn("#999"), width: 64 }} onClick={() => setN(Math.min(20, n + 1))}>＋</button>
      </div>
      <button style={btn()} disabled={!!busy} onClick={() => trade("buy")}>{busy || `${n}枚 買う`}</button>
      <button style={btn("#555")} disabled={!!busy || !me || me.patron < n} onClick={() => trade("sell")}>{`${n}枚 売る`}</button>
      <p style={{ fontSize: 14, color: "#666" }}>支払いはテスト用ドル（無料で自動でもらえます）。ウォレットは不要です。</p>
      <button style={{ ...btn("#ddd"), color: "#333", fontSize: 18 }} onClick={logout}>ログアウト</button>
    </>}
    {err && <div className="pd-err" style={{ fontSize: 18 }}>{err}</div>}
    {ok && <div style={{ fontSize: 20, color: "#0a7d32", fontWeight: 700 }}>✓ {ok.msg}{ok.tx && <> · <a href={explorerTx(ok.tx)} target="_blank" rel="noreferrer" style={{ fontSize: 16 }}>記録を見る</a></>}</div>}
  </div>;
}
