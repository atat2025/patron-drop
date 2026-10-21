// Hyperliquid public read API (no keys, no signing). Used for the "Hyperliquid" venue on /perp/ and /spot/.
import type { Book, Candle, Market, Stats, TradeRow } from "./types";
const API = "https://api.hyperliquid.xyz/info";
const post = async <T,>(body: unknown): Promise<T> => {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("Hyperliquid " + r.status);
  return r.json() as Promise<T>;
};
type Ctx = { markPx: string; midPx?: string; prevDayPx: string; dayNtlVlm: string; oraclePx?: string; openInterest?: string; funding?: string };
export type HlMarket = Market & { coin: string; ctx: Ctx; maxLev?: number };
const UNWRAP: Record<string, string> = { UBTC: "BTC", UETH: "ETH", USOL: "SOL", UFART: "FARTCOIN", USDT0: "USDT" };

export async function hlPerps(): Promise<HlMarket[]> {
  const [meta, ctxs] = await post<[{ universe: { name: string; maxLeverage: number; isDelisted?: boolean }[] }, Ctx[]]>({ type: "metaAndAssetCtxs" });
  return meta.universe.map((u, i) => ({ u, c: ctxs[i] })).filter(({ u, c }) => !u.isDelisted && c && +c.markPx > 0)
    .sort((a, b) => +b.c.dayNtlVlm - +a.c.dayNtlVlm).slice(0, 80)
    .map(({ u, c }) => ({ id: "hl:" + u.name, coin: u.name, symbol: `${u.name}/USDC`, base: u.name, quote: "USDC", price: +c.markPx,
      change24h: +c.prevDayPx ? ((+c.markPx - +c.prevDayPx) / +c.prevDayPx) * 100 : 0, volume: +c.dayNtlVlm, ctx: c, maxLev: u.maxLeverage }));
}
export async function hlSpots(): Promise<HlMarket[]> {
  const [meta, ctxs] = await post<[{ tokens: { name: string; index: number }[]; universe: { name: string; tokens: [number, number]; index: number }[] }, (Ctx & { coin: string })[]]>({ type: "spotMetaAndAssetCtxs" });
  const ctxBy = new Map(ctxs.map((c) => [c.coin, c]));
  const tok = new Map(meta.tokens.map((t) => [t.index, t.name]));
  return meta.universe.map((u) => ({ u, c: ctxBy.get(u.name) })).filter(({ u, c }) => c && +c.markPx > 0 && +c.dayNtlVlm > 0 && tok.get(u.tokens[1]) === "USDC")
    .sort((a, b) => +b.c!.dayNtlVlm - +a.c!.dayNtlVlm).slice(0, 40)
    .map(({ u, c }) => { const raw = tok.get(u.tokens[0]) ?? u.name; const base = UNWRAP[raw] ?? raw;
      return { id: "hls:" + u.name, coin: u.name, symbol: `${raw}/USDC`, base, quote: "USDC", price: +c!.markPx,
        change24h: +c!.prevDayPx ? ((+c!.markPx - +c!.prevDayPx) / +c!.prevDayPx) * 100 : 0, volume: +c!.dayNtlVlm, ctx: c! }; });
}
export async function hlBook(coin: string): Promise<Book> {
  const r = await post<{ levels: [{ px: string; sz: string }[], { px: string; sz: string }[]] }>({ type: "l2Book", coin });
  const map = (l: { px: string; sz: string }) => ({ price: +l.px, size: +l.sz });
  return { bids: r.levels[0].slice(0, 12).map(map), asks: r.levels[1].slice(0, 12).map(map) };
}
export async function hlTrades(coin: string): Promise<TradeRow[]> {
  const r = await post<{ px: string; sz: string; side: "B" | "A"; time: number }[]>({ type: "recentTrades", coin });
  return r.map((t) => ({ price: +t.px, size: +t.sz, side: (t.side === "B" ? "BUY" : "SELL") as "BUY" | "SELL", time: t.time })).reverse();
}
const IV: Record<string, number> = { "1m": 6e4, "3m": 18e4, "5m": 3e5, "15m": 9e5, "1h": 36e5, "4h": 144e5, "1d": 864e5, "1w": 6048e5, "1M": 2592e6 };
export async function hlCandleData(coin: string, interval: string): Promise<Candle[]> {
  const end = Date.now();
  const r = await post<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>({ type: "candleSnapshot", req: { coin, interval, startTime: end - 1000 * IV[interval], endTime: end } });
  return r.map((c) => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }));
}
export function hlStats(m: HlMarket, candles: Candle[]): Stats {
  const c = m.ctx, d = candles.filter((x) => x.t > Date.now() - 864e5);
  return { mark: +c.markPx, index: +(c.oraclePx ?? c.markPx), high: d.length ? Math.max(...d.map((x) => x.h)) : 0, low: d.length ? Math.min(...d.map((x) => x.l)) : 0,
    volume: +c.dayNtlVlm, oi: +(c.openInterest ?? 0) * +c.markPx, funding: +(c.funding ?? 0), nextFunding: Math.ceil(Date.now() / 36e5) * 36e5 };
}
