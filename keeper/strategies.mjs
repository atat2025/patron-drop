// Simple, transparent rules. Each returns { action: "buy"|"sell"|null, amount, why }.
// p = current marginal buy price (SEI per token, number). hist = recent execution prices (oldest -> newest).
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

export function momentum({ p, hist, v }) {
  const h = hist.slice(-8);
  if (h.length < 3) return { action: null, why: "not enough price history" };
  const ma = mean(h);
  if (p > ma * 1.004) return { action: "buy", amount: 1, why: `price ${p.toFixed(5)} above 8-trade avg ${ma.toFixed(5)} (trend up)` };
  if (p < ma * 0.996 && v.tok > 0) return { action: "sell", amount: Math.min(2, v.tok), why: `price ${p.toFixed(5)} below 8-trade avg ${ma.toFixed(5)} (trend down)` };
  return { action: null, why: `no trend (price ${p.toFixed(5)}, avg ${ma.toFixed(5)})` };
}

export function meanrev({ p, hist, v, nav }) {
  const h = hist.slice(-20);
  if (h.length < 3) return { action: null, why: "not enough price history" };
  const ma = mean(h);
  const tokShare = nav > 0 ? (v.tok * p) / nav : 0;
  if (p > ma * 1.008 && v.tok > 0) return { action: "sell", amount: Math.min(2, v.tok), why: `price ${p.toFixed(5)} stretched above 20-trade avg ${ma.toFixed(5)}` };
  if (p < ma * 0.992) return { action: "buy", amount: 1, why: `price ${p.toFixed(5)} below 20-trade avg ${ma.toFixed(5)}` };
  if (tokShare < 0.25 && p <= ma * 1.002) return { action: "buy", amount: 1, why: `building base position (${(tokShare * 100).toFixed(0)}% in PATRON)` };
  return { action: null, why: `price near average (${p.toFixed(5)} vs ${ma.toFixed(5)})` };
}

export function dca({ p, v, nav, avgCost }) {
  const cashShare = nav > 0 ? Number(v.sei) / 1e18 / nav : 0;
  if (v.tok >= 2 && avgCost && p * 0.994 > avgCost * 1.03) return { action: "sell", amount: 1, why: `take profit: price ${p.toFixed(5)} > avg cost ${avgCost.toFixed(5)} +3%` };
  if (cashShare > 0.4) return { action: "buy", amount: 1, why: `scheduled buy (cash ${(cashShare * 100).toFixed(0)}%)` };
  return { action: null, why: `cash floor reached (${(cashShare * 100).toFixed(0)}%)` };
}

export const STRATEGIES = { momentum, meanrev, dca };
