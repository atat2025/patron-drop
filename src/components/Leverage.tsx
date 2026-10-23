"use client";
/** TESTNET DEMO: SEI3X, a 3x daily-leveraged SEI token on Sei testnet (1328), collateral mUSDC. */
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, defineChain, http, parseAbi, type Address } from "viem";
import { requireEth } from "@/lib/wallet";

const CHAIN = defineChain({ id: 1328, name: "Sei Testnet", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 },
  rpcUrls: { default: { http: ["https://evm-rpc-testnet.sei-apis.com"] } }, blockExplorers: { default: { name: "Seitrace", url: "https://seitrace.com" } } });
const X3 = "0x5d4000a525E59406DaDf219796Da41D6a12f0d3E" as Address;
const USDC = "0x15828F985E1d5A47d663b2AB635158a3fbbC035C" as Address;
const xAbi = parseAbi(["function nav() view returns (uint256)", "function price() view returns (uint256)", "function anchorPrice() view returns (uint256)",
  "function lastRebalance() view returns (uint256)", "function priceUpdated() view returns (uint256)", "function totalSupply() view returns (uint256)", "function tvl() view returns (uint256)",
  "function collateralRatioBps() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function mint(uint256,uint256) returns (uint256)", "function redeem(uint256,uint256) returns (uint256)"]);
const uAbi = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function faucet(uint256)"]);
const pub = createPublicClient({ chain: CHAIN, transport: http() });
const R = "#ff0047", B = "#3aa0ff";
const exp = (a: string, k = "address") => `https://seitrace.com/${k}/${a}?chain=atlantic-2`;

type S = { nav: bigint; price: bigint; anchor: bigint; last: bigint; supply: bigint; tvl: bigint; cr: bigint };

export default function Leverage() {
  const [s, setS] = useState<S | null>(null);
  const [me, setMe] = useState<Address | null>(null);
  const [bal, setBal] = useState<{ u: bigint; x: bigint }>({ u: 0n, x: 0n });
  const [tab, setTab] = useState<"mint" | "redeem">("mint");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = (f: string) => pub.readContract({ address: X3, abi: xAbi, functionName: f as "nav" }) as Promise<bigint>;
    const [nav, price, anchor, last, supply, tvl, cr] = await Promise.all(["nav", "price", "anchorPrice", "lastRebalance", "totalSupply", "tvl", "collateralRatioBps"].map(r));
    setS({ nav, price, anchor, last, supply, tvl, cr });
    if (me) {
      const [u, x] = await Promise.all([pub.readContract({ address: USDC, abi: uAbi, functionName: "balanceOf", args: [me] }), pub.readContract({ address: X3, abi: xAbi, functionName: "balanceOf", args: [me] })]);
      setBal({ u, x });
    }
  }, [me]);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), 15000); return () => clearInterval(t); }, [load]);

  async function wallet() {
    const e = await requireEth();
    const [a] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
    if (Number(await e.request({ method: "eth_chainId" })) !== 1328) {
      try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x530" }] }); }
      catch { await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: "0x530", chainName: "Sei Testnet", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: ["https://evm-rpc-testnet.sei-apis.com"], blockExplorerUrls: ["https://seitrace.com"] }] }); }
    }
    setMe(a); return createWalletClient({ account: a, chain: CHAIN, transport: custom(e) });
  }
  async function run(label: string, f: () => Promise<void>) {
    setBusy(label); setMsg("");
    try { await f(); setMsg("Done ✓"); setAmt(""); await load(); } catch (e) { setMsg((e as { shortMessage?: string }).shortMessage || (e as Error).message); } finally { setBusy(""); }
  }
  const wait = async (h: `0x${string}`) => { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("Transaction reverted"); };

  const n = Number(amt) || 0;
  const navN = s ? Number(s.nav) / 1e6 : 1;
  const out = tab === "mint" ? n / navN : n * navN;
  const sei = s ? Number(s.price) / 1e8 : 0;
  const seiMove = s ? (Number(s.price) / Number(s.anchor) - 1) * 100 : 0;
  const crPct = s ? (s.supply === 0n ? "∞" : (Number(s.cr) / 100).toFixed(0) + "%") : "…";

  const submit = () => run(tab, async () => {
    const w = await wallet(); const a = w.account!.address;
    if (tab === "mint") {
      const v = BigInt(Math.floor(n * 1e6));
      const al = await pub.readContract({ address: USDC, abi: uAbi, functionName: "allowance", args: [a, X3] });
      if (al < v) await wait(await w.writeContract({ address: USDC, abi: uAbi, functionName: "approve", args: [X3, 2n ** 255n], account: a, chain: CHAIN }));
      const min = (v * 10n ** 18n / (s?.nav || 1n)) * 99n / 100n;
      await wait(await w.writeContract({ address: X3, abi: xAbi, functionName: "mint", args: [v, min], account: a, chain: CHAIN }));
    } else {
      const v = BigInt(Math.floor(n * 1e6)) * 10n ** 12n;
      const min = (v * (s?.nav || 0n) / 10n ** 18n) * 99n / 100n;
      await wait(await w.writeContract({ address: X3, abi: xAbi, functionName: "redeem", args: [v, min], account: a, chain: CHAIN }));
    }
  });

  const card: React.CSSProperties = { background: "#0f1217", border: "1px solid #1c2129", borderRadius: 16, padding: 18 };
  const stat = (k: string, v: string, c = "#fff") => <div style={{ ...card, padding: 14 }}><div style={{ fontSize: 12, color: "#8a93a0" }}>{k}</div><div style={{ fontSize: 20, fontWeight: 700, color: c, marginTop: 4 }}>{v}</div></div>;

  return <main style={{ background: "#080a0d", color: "#fff", minHeight: "100vh", padding: "24px 16px 60px" }}>
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "inline-block", background: "rgba(255,0,71,.12)", color: R, border: `1px solid ${R}`, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>Testnet demo · Sei atlantic-2 · no real money</div>
      <h1 style={{ fontSize: 34, margin: "14px 0 6px", fontWeight: 800 }}>SEI <span style={{ color: B }}>3x</span> Leverage</h1>
      <p style={{ color: "#a0a8b4", margin: 0, maxWidth: 620 }}>Get 3x daily exposure to SEI with one token. Deposit USDC, mint SEI3X. No margin calls, no liquidation screen: the token rebalances back to 3x every day.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, margin: "20px 0" }}>
        {stat("SEI3X price (NAV)", s ? "$" + navN.toFixed(4) : "…", B)}
        {stat("Target leverage", "3.00x")}
        {stat("SEI price", s ? "$" + sei.toFixed(5) : "…")}
        {stat("SEI since rebalance", s ? (seiMove >= 0 ? "+" : "") + seiMove.toFixed(2) + "%" : "…", seiMove >= 0 ? B : R)}
        {stat("Collateral ratio", crPct)}
        {stat("TVL", s ? "$" + (Number(s.tvl) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "…")}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <div style={card}>
          <div style={{ display: "flex", background: "#080a0d", borderRadius: 12, padding: 4, marginBottom: 16 }}>
            {(["mint", "redeem"] as const).map((t) => <button key={t} onClick={() => { setTab(t); setAmt(""); }} style={{ flex: 1, padding: 10, borderRadius: 9, border: 0, fontWeight: 700, cursor: "pointer", background: tab === t ? (t === "mint" ? B : R) : "transparent", color: tab === t ? "#fff" : "#8a93a0" }}>{t === "mint" ? "Mint" : "Redeem"}</button>)}
          </div>
          <label style={{ fontSize: 12, color: "#8a93a0" }}>You pay</label>
          <div style={{ display: "flex", alignItems: "center", background: "#080a0d", borderRadius: 12, padding: "10px 12px", margin: "6px 0 4px" }}>
            <input inputMode="decimal" placeholder="0.00" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} style={{ flex: 1, background: "transparent", border: 0, color: "#fff", fontSize: 24, outline: "none", minWidth: 0 }} />
            <b>{tab === "mint" ? "USDC" : "SEI3X"}</b>
          </div>
          {me && <div style={{ fontSize: 12, color: "#8a93a0", textAlign: "right", cursor: "pointer" }} onClick={() => setAmt(String(tab === "mint" ? Number(bal.u) / 1e6 : Number(bal.x) / 1e18))}>Balance: {tab === "mint" ? (Number(bal.u) / 1e6).toFixed(2) + " USDC" : (Number(bal.x) / 1e18).toFixed(4) + " SEI3X"} · Max</div>}
          <div style={{ textAlign: "center", color: "#8a93a0", margin: "6px 0" }}>↓</div>
          <label style={{ fontSize: 12, color: "#8a93a0" }}>You receive (est.)</label>
          <div style={{ display: "flex", background: "#080a0d", borderRadius: 12, padding: "12px", margin: "6px 0 14px", fontSize: 22 }}><span style={{ flex: 1 }}>{out ? out.toFixed(4) : "0.00"}</span><b style={{ fontSize: 16 }}>{tab === "mint" ? "SEI3X" : "USDC"}</b></div>
          <div style={{ fontSize: 13, color: "#a0a8b4", display: "grid", gap: 4, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Rate</span><span>1 SEI3X = ${navN.toFixed(4)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Effective leverage</span><span>3.00x</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>Fee</span><span>0% (demo)</span></div>
          </div>
          {!me ? <button onClick={() => run("connect", async () => { await wallet(); })} style={{ width: "100%", padding: 14, borderRadius: 12, border: 0, background: B, color: "#fff", fontWeight: 800, fontSize: 16 }}>{busy ? "Connecting…" : "Connect wallet"}</button>
            : <button disabled={!n || !!busy} onClick={submit} style={{ width: "100%", padding: 14, borderRadius: 12, border: 0, background: tab === "mint" ? B : R, color: "#fff", fontWeight: 800, fontSize: 16, opacity: !n || busy ? .5 : 1 }}>{busy ? "Confirm in wallet…" : tab === "mint" ? "Mint SEI3X" : "Redeem for USDC"}</button>}
          {me && <button onClick={() => run("faucet", async () => { const w = await wallet(); await wait(await w.writeContract({ address: USDC, abi: uAbi, functionName: "faucet", args: [100_000_000n], account: w.account!.address, chain: CHAIN })); })} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, background: "transparent", border: "1px solid #2a313b", color: "#a0a8b4" }}>Get 100 test USDC (free)</button>}
          {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith("Done") ? B : R, wordBreak: "break-word" }}>{msg}</div>}
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>How it works</h3>
          <ol style={{ color: "#a0a8b4", fontSize: 14, lineHeight: 1.6, paddingLeft: 18 }}>
            <li>Deposit USDC and mint SEI3X at the current NAV.</li>
            <li>SEI3X moves 3x the daily SEI move. SEI +1% → SEI3X ≈ +3%. SEI −1% → SEI3X ≈ −3%.</li>
            <li>Once a day the token rebalances back to 3x, so you never get liquidated.</li>
            <li>Redeem any time for USDC at NAV.</li>
          </ol>
          <h3>Risks</h3>
          <ul style={{ color: "#a0a8b4", fontSize: 14, lineHeight: 1.6, paddingLeft: 18 }}>
            <li>Losses are 3x too. A fast drop can wipe out most of the value.</li>
            <li>Daily rebalancing causes decay in choppy markets. Not for long-term holding.</li>
            <li>This is a testnet demo. Unaudited. Not an offer.</li>
          </ul>
          <div style={{ fontSize: 12, color: "#6b7480", marginTop: 12, lineHeight: 1.6 }}>
            Contract: <a href={exp(X3)} target="_blank" rel="noreferrer" style={{ color: B }}>{X3.slice(0, 8)}…{X3.slice(-6)}</a><br />
            Collateral: test USDC <a href={exp(USDC)} target="_blank" rel="noreferrer" style={{ color: B }}>{USDC.slice(0, 8)}…</a><br />
            {s && <>Last rebalance: {new Date(Number(s.last) * 1000).toLocaleString()}</>}
          </div>
        </div>
      </div>
    </div>
  </main>;
}
