"use client";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/patronChain";

/** Easy login: name + 6-digit PIN. Keys are encrypted server-side (Sei testnet only). */
const API = process.env.NEXT_PUBLIC_EASY_API || "https://patron-login-api.vercel.app/api";
const TK = "patron-easy-token";
const big = { fontSize: 22, lineHeight: 1.5 } as const;
const input = { ...big, width: "100%", padding: "14px 12px", borderRadius: 12, border: "2px solid #ccc", margin: "6px 0 14px", boxSizing: "border-box" } as const;

async function call(path: string, body?: object, token?: string) {
  const r = await fetch(`${API}/${path}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(({ 400: "Please check your name (2-40 characters) and 6-digit PIN.", 401: "Wrong name or PIN, or your session expired. Please log in again.", 409: "That name is already taken. Please choose another.", 429: "Too many attempts. Please wait 15 minutes." } as Record<number, string>)[r.status] || "Something went wrong. Please try again in a moment.");
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
  const enter = () => run(tab === "new" ? "Creating account…" : "Logging in…", async () => {
    const r = await call(tab === "new" ? "register" : "login", { id, pin });
    localStorage.setItem(TK, r.token); setToken(r.token); setPin("");
  });
  const trade = (kind: "buy" | "sell") => run(kind === "buy" ? "Buying… (about 30 s)" : "Selling…", async () => {
    const r = await call(kind, { n, pay: "mUSDC" }, token!);
    setOk({ msg: kind === "buy" ? `Bought ${n}` : `Sold ${n}`, tx: r.tx });
    setMe(await call("me", undefined, token!)); onDone();
  });
  const logout = () => { localStorage.removeItem(TK); setTab("login"); setToken(null); setMe(null); onAddr(null); };
  const btn = (bg = "#ff4a9f") => ({ ...big, width: "100%", padding: "16px", borderRadius: 14, border: 0, background: bg, color: "#fff", fontWeight: 700, margin: "6px 0", cursor: "pointer" } as const);

  return <div className="easy" style={{ ...big, fontSize: 18 }}>
    <div className="pd-mh" style={{ fontSize: 24 }}>Easy login</div>
    <div role="note" style={{ background: "#fff3c4", border: "2px solid #e0b000", borderRadius: 12, padding: "10px 12px", margin: "8px 0 14px", fontSize: 18, fontWeight: 700 }}>
      Testnet only · no real money
    </div>
    {!token ? <>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...btn(tab === "login" ? "#333" : "#bbb"), margin: 0 }} onClick={() => setTab("login")}>Log in</button>
        <button style={{ ...btn(tab === "new" ? "#333" : "#bbb"), margin: 0 }} onClick={() => setTab("new")}>New here</button>
      </div>
      <label>Name (your login word)<input style={input} value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. sky walker" autoComplete="username" /></label>
      <label>PIN (6 digits)<input style={{ ...input, letterSpacing: 8 }} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" placeholder="●●●●●●" autoComplete={tab === "new" ? "new-password" : "current-password"} /></label>
      {tab === "new" && <p style={{ fontSize: 16, margin: "0 0 8px" }}>Write down your name and PIN and keep them safe.</p>}
      <button style={btn()} disabled={!!busy || id.trim().length < 2 || pin.length !== 6} onClick={enter}>{busy || (tab === "new" ? "Create account" : "Log in")}</button>
    </> : <>
      {me ? <div style={{ margin: "4px 0 12px" }}>
        <div>Your PATRON: <b style={{ fontSize: 28 }}>{me.patron}</b></div>
        <div style={{ fontSize: 15, color: "#666" }}>Test dollars {me.musdc.toFixed(2)} · gas SEI {Number(me.sei).toFixed(3)}</div>
      </div> : <p>Loading…</p>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "8px 0" }}>
        <button style={{ ...btn("#999"), width: 64 }} onClick={() => setN(Math.max(1, n - 1))}>−</button>
        <b style={{ fontSize: 32 }}>{n}</b>
        <button style={{ ...btn("#999"), width: 64 }} onClick={() => setN(Math.min(20, n + 1))}>＋</button>
      </div>
      <button style={btn()} disabled={!!busy} onClick={() => trade("buy")}>{busy || `Buy ${n}`}</button>
      <button style={btn("#555")} disabled={!!busy || !me || me.patron < n} onClick={() => trade("sell")}>{`Sell ${n}`}</button>
      <p style={{ fontSize: 14, color: "#666" }}>You pay with free test dollars. No wallet needed.</p>
      <button style={{ ...btn("#ddd"), color: "#333", fontSize: 18 }} onClick={logout}>Log out</button>
    </>}
    {err && <div className="pd-err" style={{ fontSize: 18 }}>{err}</div>}
    {ok && <div style={{ fontSize: 20, color: "#0a7d32", fontWeight: 700 }}>✓ {ok.msg}{ok.tx && <> · <a href={explorerTx(ok.tx)} target="_blank" rel="noreferrer" style={{ fontSize: 16 }}>view tx</a></>}</div>}
  </div>;
}
