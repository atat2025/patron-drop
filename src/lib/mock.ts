import type { Book, Candle, Market, TradeRow } from "./types";

export const MOCK_MARKETS: Market[] = [
  { id: "mock-btc", symbol: "BTC-PERP", base: "BTC", quote: "USDC", price: 112450, change24h: 1.8, mock: true },
  { id: "mock-eth", symbol: "ETH-PERP", base: "ETH", quote: "USDC", price: 4120, change24h: -0.9, mock: true },
  { id: "mock-sei", symbol: "SEI-PERP", base: "SEI", quote: "USDC", price: 0.31, change24h: 4.2, mock: true },
  { id: "mock-nvda", symbol: "NVDA-PERP", base: "NVDA", quote: "USDC", price: 186.2, change24h: 0.6, mock: true },
];

const rnd = (seed: number) => { const x = Math.sin(seed) * 10000; return x - Math.floor(x); };

export function mockBook(price: number): Book {
  const tick = price * 0.0002;
  const bids = Array.from({ length: 14 }, (_, i) => ({ price: price - tick * (i + 1), size: +(rnd(i + price) * 5 + 0.1).toFixed(3) }));
  const asks = Array.from({ length: 14 }, (_, i) => ({ price: price + tick * (i + 1), size: +(rnd(i * 7 + price) * 5 + 0.1).toFixed(3) }));
  return { bids, asks };
}

export function mockTrades(price: number): TradeRow[] {
  const now = Date.now();
  return Array.from({ length: 20 }, (_, i) => ({
    price: price * (1 + (rnd(i + now / 1e6) - 0.5) * 0.001),
    size: +(rnd(i * 3) * 2).toFixed(3),
    side: rnd(i * 11) > 0.5 ? "BUY" : "SELL",
    time: now - i * 4000,
  }));
}

export function mockCandles(price: number, n = 80): Candle[] {
  const out: Candle[] = [];
  let p = price * 0.97;
  const now = Date.now();
  for (let i = 0; i < n; i++) {
    const o = p; const c = o * (1 + (rnd(i + price) - 0.48) * 0.01);
    out.push({ t: now - (n - i) * 3600_000, o, c, h: Math.max(o, c) * 1.003, l: Math.min(o, c) * 0.997 });
    p = c;
  }
  return out;
}
