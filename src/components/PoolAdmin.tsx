"use client";
import { useState } from "react";
import { createWalletClient, custom, parseAbi, type Address, type EIP1193Provider } from "viem";
import { connect, switchTo, sei, pub } from "@/lib/bridge";

const CURVE = "0x88b1de8c7C04905f3c16bd67B6ED8a75075fC99B" as Address;
const OWNER = "0x8d80a36cAE77589A0629721f0FC2757A4FABc951";
const KEEPER = "0xe45a0912E6B27443FE8CADfb827228b09FDdfaAe" as Address;
const AMT = 510n * 10n ** 18n;
const abi = parseAbi(["function withdrawInventory(address to, uint256 amount)"]);

export default function PoolAdmin() {
  const [me, setMe] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string; h?: string } | null>(null);
  const isOwner = me?.toLowerCase() === OWNER.toLowerCase();
  const doConnect = async () => { try { const a = await connect(); await switchTo("sei"); setMe(a); setMsg(null); } catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); } };
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      await switchTo("sei");
      const e = (window as unknown as { ethereum?: EIP1193Provider }).ethereum!;
      const w = createWalletClient({ account: me!, chain: sei, transport: custom(e) });
      const h = await w.writeContract({ address: CURVE, abi, functionName: "withdrawInventory", args: [KEEPER, AMT], account: me!, chain: sei });
      const r = await pub.sei.waitForTransactionReceipt({ hash: h });
      setMsg(r.status === "success" ? { ok: true, t: "完了しました。510 PATを作業用ウォレットへ移しました。", h } : { ok: false, t: "失敗しました（取り消されました）。", h });
    } catch (e) { setMsg({ ok: false, t: (e as Error).message.split("\n")[0] }); }
    setBusy(false);
  };
  return (
    <div className="pd"><main className="pd-main">
      <section className="pd-card"><div className="pd-card-h"><h1>売り場の準備</h1><p>Sei · 1329</p></div></section>
      <section className="pv-card">
        <p>在庫から510 PATを作業用ウォレットへ移して、DragonSwapに売り場を作ります</p>
        <small className="pd-fine">送り先: {KEEPER}</small>
        <button className="pd-wallet" onClick={doConnect}>{me ? `${me.slice(0, 6)}…${me.slice(-4)}` : "接続する"}</button>
        {me && !isOwner && <div className="pd-err">このウォレットはオーナー（{OWNER.slice(0, 6)}…{OWNER.slice(-4)}）ではありません。オーナーのウォレットで接続してください。</div>}
        <button className="pd-buy" disabled={!isOwner || busy} onClick={go}>{busy ? "ウォレットで確認してください…" : "承認する"}</button>
        {msg && <div className={msg.ok ? "pv-ok" : "pd-err"}>{msg.t}{msg.h && <> · <a href={`https://seiscan.io/tx/${msg.h}`} target="_blank" rel="noreferrer">seiscanで見る ↗</a></>}</div>}
      </section>
    </main></div>
  );
}
