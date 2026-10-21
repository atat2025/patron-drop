"use client";
import { MonacoSDK } from "@0xmonaco/core";
import type { TradingPair } from "@0xmonaco/types";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { sei, seiTestnet } from "viem/chains";
import { config } from "./config";
import { MOCK_MARKETS, mockBook, mockCandles, mockTrades } from "./mock";
import type { Book, Candle, Market, PositionRow, Stats, TradeRow } from "./types";

let publicSdk: MonacoSDK | null = null;
let userSdk: MonacoSDK | null = null;

function getPublicSdk() {
  if (!publicSdk) publicSdk = new MonacoSDK({ network: config.network, seiRpcUrl: config.seiRpcUrl, ...(config.apiUrl ? { apiUrl: config.apiUrl, wsUrl: config.wsUrl } : {}) });
  return publicSdk;
}
export function getUserSdk() { return userSdk; }

const withTimeout = <T,>(p: Promise<T>, ms = 6000) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

export async function loadMarkets(): Promise<{ markets: Market[]; live: boolean }> {
  if (config.forceMock) return { markets: MOCK_MARKETS, live: false };
  try {
    const res = await withTimeout(getPublicSdk().market.getPaginatedTradingPairs({ pageSize: 100 }));
    const perps = res.tradingPairs.filter((p: TradingPair) => p.marketType === "MARGIN");
    if (!perps.length) throw new Error("no perp markets");
    const markets = perps.map((p: TradingPair) => {
      const x = p as TradingPair & { lastPrice?: string; priceChangePercent24h?: string };
      return { id: p.id, symbol: p.symbol, base: p.baseToken, quote: p.quoteToken, price: Number(x.lastPrice ?? 0), change24h: Number(x.priceChangePercent24h ?? 0) };
    });
    return { markets, live: true };
  } catch (e) {
    console.warn("[monaco] markets unavailable, using mock", e);
    return { markets: MOCK_MARKETS, live: false };
  }
}

export async function loadBook(m: Market): Promise<Book> {
  if (m.mock) return mockBook(m.price);
  try {
    const ob = await withTimeout(getPublicSdk().orderbook.getOrderbook(m.id, { tradingMode: "MARGIN" }));
    const map = (l: { price: string; quantity: string }) => ({ price: Number(l.price), size: Number(l.quantity) });
    return { bids: ob.bids.slice(0, 14).map(map), asks: ob.asks.slice(0, 14).map(map) };
  } catch { return mockBook(m.price || 1); }
}

/** Where the shown chart came from, per market id: "monaco" or a reference feed when Monaco has too few trades. */
export const candleSource: Record<string, string> = {};
const IV_MS: Record<string, number> = { "1m": 60_000, "3m": 180_000, "5m": 300_000, "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1w": 604_800_000, "1M": 2_592_000_000 };
async function hlCandles(base: string, interval = "1h"): Promise<Candle[]> {
  const end = Date.now(), start = end - 1000 * IV_MS[interval];
  for (const coin of [base, "xyz:" + base]) {
    try {
      const r = await withTimeout(fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval, startTime: start, endTime: end } }) }).then((x) => x.json()), 6000);
      if (Array.isArray(r) && r.length > 5) return r.map((c: { t: number; o: string; h: string; l: string; c: string; v: string }) => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }));
    } catch {}
  }
  return [];
}
const thin = (cs: Candle[]) => cs.length < 12 || new Set(cs.slice(-24).map((c) => c.c)).size < 4;
export async function loadCandles(m: Market, interval: "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M" = "1h"): Promise<Candle[]> {
  if (m.mock) return mockCandles(m.price);
  if (config.network === "mainnet") {
    let cs: Candle[] = [];
    try { cs = await loadMonacoCandles(m, interval); } catch {}
    if (!thin(cs)) { candleSource[m.id] = "monaco"; return cs; }
    const ref = await hlCandles(m.base, interval);
    if (ref.length) { candleSource[m.id] = "reference"; return ref; }
    candleSource[m.id] = "monaco"; return cs;
  }
  try { return await loadMonacoCandles(m, interval); } catch { return mockCandles(m.price || 1); }
}
async function loadMonacoCandles(m: Market, interval: "1m" | "3m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M"): Promise<Candle[]> {
  {
    if (!["1m", "5m", "15m", "1h", "4h", "1d"].includes(interval)) return [];
    const cs = await withTimeout(getPublicSdk().market.getCandlesticks(m.id, interval as "1m"));
    return cs
      .map((c) => ({ t: c.T ?? c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +((c as { v?: string }).v ?? 0) }))
      .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite) && c.h > 0)
      .sort((a, b) => a.t - b.t)
      .slice(-1000);
  }
}

// Recent trades: derived from mock until a public trades endpoint/WS subscription is wired (see README TODO)
export async function loadTrades(m: Market): Promise<TradeRow[]> { return mockTrades(m.price || 1); }

export async function connectWallet(): Promise<string> {
  const eth = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
  if (!eth) throw new Error("No wallet found (please install MetaMask or similar)");
  const [account] = (await eth.request({ method: "eth_requestAccounts" })) as `0x${string}`[];
  if (config.network === "mainnet") {
    const hex = "0x531";
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }).catch(() => eth.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: "Sei", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: [config.seiRpcUrl], blockExplorerUrls: ["https://seiscan.io"] }] }));
  }
  const walletClient = createWalletClient({ account, chain: config.network === "mainnet" ? sei : seiTestnet, transport: custom(eth) });
  userSdk = new MonacoSDK({ walletClient, network: config.network, seiRpcUrl: config.seiRpcUrl, ...(config.apiUrl ? { apiUrl: config.apiUrl, wsUrl: config.wsUrl } : {}) });
  if (config.clientId) await userSdk.login(config.clientId);
  return account;
}

export interface OrderInput {
  market: Market; side: "BUY" | "SELL"; type: "MARKET" | "LIMIT";
  quantity: string; price?: string; leverage: string; tp?: string; sl?: string;
}

export async function placePerpOrder(o: OrderInput): Promise<string> {
  if (o.market.mock || !userSdk) {
    await new Promise((r) => setTimeout(r, 400));
    return `Demo order: ${o.side === "BUY" ? "Long" : "Short"} ${o.quantity} ${o.market.base} @ ${o.type === "LIMIT" ? o.price : "Market"} x${o.leverage}`;
  }
  if (!config.clientId) throw new Error("NEXT_PUBLIC_MONACO_CLIENT_ID is not set");
  // Preflight risk check (required before placing perp orders)
  const risk = await userSdk.marginAccounts.simulateRiskBucketOrderRisk({
    tradingPairId: o.market.id, side: o.side, orderType: o.type,
    ...(o.type === "LIMIT" ? { price: o.price } : {}), quantity: o.quantity, leverage: o.leverage,
  } as Parameters<MonacoSDK["marginAccounts"]["simulateRiskBucketOrderRisk"]>[0]);
  if (!risk.accepted) throw new Error(`Rejected by risk check: ${risk.rejectReason ?? "unknown"}`);
  const tpsl = {
    ...(o.tp ? { takeProfit: { triggerPrice: o.tp, orderType: "MARKET" as const } } : {}),
    ...(o.sl ? { stopLoss: { triggerPrice: o.sl, orderType: "MARKET" as const } } : {}),
  };
  const opts = { tradingMode: "MARGIN" as const, leverage: o.leverage, ...tpsl };
  const res = o.type === "LIMIT"
    ? await userSdk.trading.placeLimitOrder(o.market.id, o.side, o.quantity, o.price!, opts)
    : await userSdk.trading.placeMarketOrder(o.market.id, o.side, o.quantity, opts);
  return `Order submitted: ${res.orderId} (est. liq. price ${risk.estimatedLiquidationPrice ?? "-"})`;
}

export async function loadPositions(markets: Market[]): Promise<PositionRow[]> {
  if (!userSdk || !config.clientId) return [];
  try {
    const { positions } = await userSdk.positions.listPositions({ status: "OPEN" });
    return positions.map((p) => {
      const x = p as typeof p & { unrealizedPnl?: string; liquidationPrice?: string };
      return {
        id: p.positionId, symbol: markets.find((m) => m.id === p.tradingPairId)?.symbol ?? p.tradingPairId,
        side: p.side, size: p.size, entry: p.entryPrice, mark: p.markPrice, pnl: x.unrealizedPnl ?? "-", liq: x.liquidationPrice,
      };
    });
  } catch { return []; }
}

/** Fill price + 24h change for every market from 1h candles (limited concurrency). */
export async function enrichMarkets(markets: Market[], onUpdate: (m: Market) => void) {
  const queue = markets.filter((m) => !m.mock);
  const worker = async () => {
    while (queue.length) {
      const m = queue.shift()!;
      const cs = await loadCandles(m).catch(() => [] as Candle[]);
      const last = cs[cs.length - 1];
      if (!last) continue;
      const base = cs[Math.max(0, cs.length - 25)];
      const vol = cs.slice(-24).reduce((a, c) => a + (c.v ?? 0) * c.c, 0);
      onUpdate({ ...m, price: last.c, change24h: base ? ((last.c - base.c) / base.c) * 100 : 0, volume: vol || undefined });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

export async function loadStats(m: Market, candles: Candle[]): Promise<Stats> {
  const c24 = candles.slice(-24);
  const fb: Stats = {
    mark: m.price, index: m.price, high: c24.length ? Math.max(...c24.map((c) => c.h)) : 0, low: c24.length ? Math.min(...c24.map((c) => c.l)) : 0,
    volume: m.volume ?? 0, oi: 0, funding: 0.0001, nextFunding: Math.ceil(Date.now() / 28_800_000) * 28_800_000,
  };
  if (m.mock) return fb;
  try {
    const s = await withTimeout(getPublicSdk().market.getPerpMarketSummary(m.id));
    const n = (v?: string) => (v != null && v !== "" && Number.isFinite(+v) ? +v : undefined);
    return {
      mark: n(s.markPrice) ?? fb.mark, index: n(s.indexPrice) ?? fb.index, high: n(s.high24h) ?? fb.high, low: n(s.low24h) ?? fb.low,
      volume: n(s.quoteVolume24h) ?? fb.volume, oi: n(s.openInterestNotional) ?? n(s.openInterest) ?? 0,
      funding: n(s.currentFundingRate) ?? fb.funding, nextFunding: Number.isFinite(Date.parse(s.nextFundingTime ?? "")) && Date.parse(s.nextFundingTime!) > Date.now() ? Date.parse(s.nextFundingTime!) : fb.nextFunding,
    };
  } catch { return fb; }
}

/** Showcase: markets by type (SPOT or MARGIN) and book in that mode. */
export async function loadMarketsByType(type: "SPOT" | "MARGIN"): Promise<{ markets: Market[]; live: boolean }> {
  if (config.forceMock) return { markets: MOCK_MARKETS, live: false };
  try {
    const res = await withTimeout(getPublicSdk().market.getPaginatedTradingPairs({ pageSize: 100 }));
    const ps = res.tradingPairs.filter((p: TradingPair) => p.marketType === type);
    if (!ps.length) throw new Error("no markets");
    return { markets: ps.map((p: TradingPair) => { const x = p as TradingPair & { lastPrice?: string; priceChangePercent24h?: string };
      return { id: p.id, symbol: p.symbol, base: p.baseToken, quote: p.quoteToken, price: Number(x.lastPrice ?? 0), change24h: Number(x.priceChangePercent24h ?? 0) }; }), live: true };
  } catch { if (config.network === "mainnet") return { markets: [], live: false }; return { markets: type === "MARGIN" ? MOCK_MARKETS : MOCK_MARKETS.map((m) => ({ ...m, id: m.id + "-spot", symbol: `${m.base}/${m.quote}` })), live: false }; }
}
export async function loadBookMode(m: Market, mode: "SPOT" | "MARGIN"): Promise<Book> {
  if (m.mock) return mockBook(m.price || 1);
  try {
    const ob = await withTimeout(getPublicSdk().orderbook.getOrderbook(m.id, { tradingMode: mode }));
    const map = (l: { price: string; quantity: string }) => ({ price: Number(l.price), size: Number(l.quantity) });
    return { bids: ob.bids.slice(0, 12).map(map), asks: ob.asks.slice(0, 12).map(map) };
  } catch { return config.network === "mainnet" ? { bids: [], asks: [] } : mockBook(m.price || 1); }
}

/* ---------- Live trading helpers (visitor's own wallet signs; staging = Sei testnet) ---------- */
export type Mode = "SPOT" | "MARGIN";
export async function loadLiveTrades(m: Market, mode: Mode): Promise<TradeRow[] | null> {
  if (m.mock) return null;
  try {
    const r = await withTimeout(getPublicSdk().trades.getTrades(m.id, { pageSize: 30 }));
    const ts = r.trades.filter((t) => !t.tradingMode || t.tradingMode === mode);
    return ts.map((t) => ({ price: +t.data.price, size: +t.data.quantity, side: t.data.makerSide === "SELL" ? "BUY" : "SELL", time: Date.parse(t.data.executedAt) || 0 }));
  } catch { return null; }
}
function need() { if (!userSdk) throw new Error("Connect your wallet first"); return userSdk; }
export interface BalRow { assetId: string; symbol: string; available: string; locked: string; token: string; decimals: number }
export async function loadBalances(): Promise<BalRow[]> {
  const sdk = need();
  const r = await sdk.profile.getUserBalances({ pageSize: 50 } as never);
  return r.balances.map((b) => ({ assetId: b.assetId, symbol: b.symbol ?? b.token.slice(0, 8), available: b.availableBalance, locked: b.lockedBalance, token: b.token, decimals: b.decimals }));
}
export interface OrderRow { id: string; pair: string; side: string; type: string; price?: string; qty: string; filled: string; status: string; mode?: string }
export async function loadOpenOrders(markets: Market[]): Promise<OrderRow[]> {
  const sdk = need();
  const r = await sdk.trading.getPaginatedOrders({ status: ["SUBMITTED", "PARTIALLY_FILLED"], pageSize: 50 } as never);
  return r.orders.map((o) => ({ id: o.id, pair: markets.find((m) => m.id === o.tradingPairId)?.symbol ?? o.tradingPairId.slice(0, 8), side: o.side, type: o.orderType, price: o.price, qty: o.quantity, filled: o.filledQuantity, status: o.status, mode: (o as { tradingMode?: string }).tradingMode }));
}
export async function cancelOrder(id: string) { return need().trading.cancelOrder(id); }
export async function placeOrder(o: OrderInput & { mode: Mode }): Promise<string> {
  if (o.mode === "MARGIN") return placePerpOrder(o);
  const sdk = need();
  const res = o.type === "LIMIT"
    ? await sdk.trading.placeLimitOrder(o.market.id, o.side, o.quantity, o.price!, { tradingMode: "SPOT" })
    : await sdk.trading.placeMarketOrder(o.market.id, o.side, o.quantity, { tradingMode: "SPOT" });
  return `Order submitted: ${res.orderId}`;
}
/** Approve (if needed) + deposit an ERC20 from the wallet into the Monaco vault. Wallet signs each tx. */
export async function depositAsset(assetId: string, amount: bigint, onStep?: (s: string) => void): Promise<string> {
  const sdk = need();
  if (await sdk.vault.needsApproval(assetId, amount)) { onStep?.("Approve in wallet…"); await sdk.vault.approve(assetId, amount, true); }
  onStep?.("Deposit in wallet…");
  const r = await sdk.vault.deposit(assetId, amount, true);
  return r.hash;
}
export async function withdrawAsset(assetId: string, amount: bigint): Promise<string> {
  const r = await need().vault.withdraw(assetId, amount, true);
  return (r as { hash?: string }).hash ?? "";
}
export async function marketAssets(): Promise<{ assetId: string; symbol: string; decimals: number }[]> {
  const res = await withTimeout(getPublicSdk().market.getPaginatedTradingPairs({ pageSize: 100 }));
  const seen = new Map<string, { assetId: string; symbol: string; decimals: number }>();
  for (const p of res.tradingPairs) {
    const x = p;
    if (!seen.has(x.quoteAssetId)) seen.set(x.quoteAssetId, { assetId: x.quoteAssetId, symbol: p.quoteToken, decimals: p.quoteDecimals ?? 6 });
    if (p.marketType === "SPOT" && !seen.has(x.baseAssetId)) seen.set(x.baseAssetId, { assetId: x.baseAssetId, symbol: p.baseToken, decimals: p.baseDecimals ?? 18 });
  }
  return [...seen.values()];
}
