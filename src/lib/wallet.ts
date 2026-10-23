/** One wallet provider for the whole site.
 * 1) Injected wallet (MetaMask / Rabby / in-app wallet browsers) if present.
 * 2) Otherwise WalletConnect v2 (Reown) QR / deep link — needs NEXT_PUBLIC_WC_PROJECT_ID (free at cloud.reown.com).
 * 3) Otherwise a help sheet with an "Open in MetaMask" deep link.
 */
import type { EIP1193Provider } from "viem";

export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "";
const SEI_RPC = process.env.NEXT_PUBLIC_SEI_RPC_URL || "https://evm-rpc.sei-apis.com";

type WcProvider = EIP1193Provider & { session?: unknown; connect: () => Promise<void>; disconnect: () => Promise<void>; on: (e: string, f: (...a: unknown[]) => void) => void };
let wc: WcProvider | null = null;

const injected = (): EIP1193Provider | undefined =>
  typeof window !== "undefined" ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum : undefined;

/** Sync: the provider currently usable (injected, or an already-connected WalletConnect session). */
export function getEth(): EIP1193Provider | undefined {
  return injected() ?? (wc && wc.session ? wc : undefined);
}
/** True if a Connect button can do something useful (injected or WalletConnect available). */
export const canConnect = () => Boolean(injected()) || Boolean(WC_PROJECT_ID);

export const NO_WALLET_MSG = "Open this page in your wallet app (MetaMask, Trust, Rainbow…) to connect.";

export function metamaskDeepLink(): string {
  if (typeof window === "undefined") return "https://metamask.app.link/dapp/app.patron.red/";
  return "https://metamask.app.link/dapp/" + window.location.host + window.location.pathname + window.location.search;
}

function showNoWalletSheet() {
  if (typeof document === "undefined" || document.getElementById("pw-nowallet")) return;
  const d = document.createElement("div");
  d.id = "pw-nowallet";
  d.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif");
  const url = metamaskDeepLink();
  d.innerHTML = `<div style="background:#111;color:#fff;width:100%;max-width:440px;border-radius:16px 16px 0 0;padding:22px 20px 28px;box-shadow:0 -8px 30px rgba(0,0,0,.5)">
  <div style="font-size:18px;font-weight:700;margin-bottom:8px">Connect a wallet</div>
  <div style="font-size:14px;color:#bbb;line-height:1.5;margin-bottom:18px">No wallet in this browser. Open this page inside your wallet app's browser to connect and trade.</div>
  <a href="${url}" style="display:block;text-align:center;background:#f6851b;color:#fff;font-weight:700;padding:14px;border-radius:12px;text-decoration:none;margin-bottom:10px">Open in MetaMask</a>
  <button id="pw-copy" style="width:100%;background:#222;color:#fff;border:1px solid #333;padding:12px;border-radius:12px;font-size:14px;margin-bottom:10px">Copy link (for Trust, Rainbow, Rabby…)</button>
  <button id="pw-close" style="width:100%;background:transparent;color:#888;border:0;padding:8px;font-size:14px">Close</button></div>`;
  d.addEventListener("click", (e) => { if (e.target === d) d.remove(); });
  document.body.appendChild(d);
  d.querySelector("#pw-close")?.addEventListener("click", () => d.remove());
  d.querySelector("#pw-copy")?.addEventListener("click", (e) => {
    navigator.clipboard?.writeText(window.location.href).then(() => { (e.target as HTMLElement).textContent = "Link copied"; }).catch(() => {});
  });
}

/** Async: get a usable provider, opening WalletConnect (QR / wallet list) if needed. */
export async function requireEth(): Promise<EIP1193Provider> {
  const i = getEth(); if (i) return i;
  if (!WC_PROJECT_ID) { showNoWalletSheet(); throw new Error(NO_WALLET_MSG); }
  if (!wc) {
    const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
    wc = (await EthereumProvider.init({
      projectId: WC_PROJECT_ID,
      chains: [1329],
      optionalChains: [1328, 1, 42161],
      rpcMap: { 1329: SEI_RPC, 1328: "https://evm-rpc-testnet.sei-apis.com", 1: "https://ethereum-rpc.publicnode.com", 42161: "https://arb1.arbitrum.io/rpc" },
      showQrModal: true,
      metadata: { name: "PATRON", description: "PATRON exchange", url: typeof window !== "undefined" ? window.location.origin : "https://app.patron.red", icons: ["https://app.patron.red/patron-logo.png"] },
    })) as unknown as WcProvider;
    wc.on("disconnect", () => { /* session cleared; next connect re-opens modal */ });
  }
  if (!wc.session) await wc.connect();
  return wc;
}
