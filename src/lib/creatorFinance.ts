// Ported from /workspace/ambassa-finance/lib/valuation.ts (fi). Reference formula only (DEMO).
/**
 * 参考値の査定式（透明なプレースホルダー。実際の与信モデルではありません）
 *   年間収益 R = Σ 月間収益 × 12
 *   収益倍率 M = 1.5 + 成長補正(月次成長率% × 0.15, 0〜1.5) + エンゲージ補正(エンゲージ率% × 0.1, 0〜0.5)
 *   オーディエンス価値 A = Σ フォロワー × プラットフォーム別単価
 *   IP評価額 V = R × M + A × 0.3
 *   最大前払い額 = min(R × 0.6, V × 0.3)   … 約7ヶ月分の収益が上限
 */
export const PLATFORMS = {
  youtube: { label: "YouTube", perFollower: 30, color: "#ff0033" },
  x: { label: "X", perFollower: 10, color: "#111111" },
  tiktok: { label: "TikTok", perFollower: 8, color: "#00c2c7" },
  instagram: { label: "Instagram", perFollower: 12, color: "#e1306c" },
  substack: { label: "Substack", perFollower: 300, color: "#ff6719" },
  live: { label: "ライブ配信", perFollower: 40, color: "#7c3aed" },
  linkedin: { label: "LinkedIn", perFollower: 15, color: "#0a66c2" },
} as const;
export type Platform = keyof typeof PLATFORMS;
export type Conn = { platform: string; followers: number; monthlyRevenue: number; engagement: number; growth: number };
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function valuate(conns: Conn[]) {
  const monthly = conns.reduce((a, c) => a + c.monthlyRevenue, 0);
  const R = monthly * 12;
  const followers = conns.reduce((a, c) => a + c.followers, 0);
  const w = (k: "engagement" | "growth") => (followers ? conns.reduce((a, c) => a + c[k] * c.followers, 0) / followers : 0);
  const eng = w("engagement"), growth = w("growth");
  const growthAdj = clamp(growth * 0.15, 0, 1.5), engAdj = clamp(eng * 0.1, 0, 0.5);
  const M = 1.5 + growthAdj + engAdj;
  const A = conns.reduce((a, c) => a + c.followers * (PLATFORMS[c.platform as Platform]?.perFollower ?? 5), 0);
  const V = Math.round(R * M + A * 0.3);
  const maxAdvance = Math.floor(Math.min(R * 0.6, V * 0.3) / 10000) * 10000;
  return { value: V, maxAdvance, monthly, annual: R, followers, engagement: +eng.toFixed(2), growth: +growth.toFixed(2), multiple: +M.toFixed(2), growthAdj: +growthAdj.toFixed(2), engAdj: +engAdj.toFixed(2), audienceValue: A };
}
export const TERMS = [6, 12, 18, 24] as const;
export const FEE: Record<number, number> = { 6: 0.08, 12: 0.12, 18: 0.16, 24: 0.2 };
/** 返済は収益の一定割合（レベニューシェア）。期間内に完済できる割合を算出（10〜50%）。 */
export function quote(amount: number, term: number, monthly: number) {
  const fee = FEE[term] ?? 0.12;
  const total = Math.round(amount * (1 + fee));
  const share = clamp(Math.ceil((total / Math.max(1, monthly * term)) * 100), 10, 50);
  return { fee, total, sharePct: share, monthlyEst: Math.round(monthly * share / 100), feeAmount: total - amount };
}
export const yen = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");
export const man = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(2) + "億円" : n >= 1e4 ? Math.round(n / 1e4).toLocaleString() + "万円" : n + "円";
export const fmtN = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
/** Deterministic mock stats from a handle (browser port of ambassa-finance mockStats). */
export function mockStats(platform: Platform, handle: string) {
  let h = 2166136261; const s = platform + handle.toLowerCase(); const b: number[] = [];
  for (let i = 0; i < 4; i++) { for (const ch of s + i) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; b.push((h & 255) / 255); }
  const base = { youtube: [50e3, 900e3, 300e3, 2.5e6], x: [10e3, 300e3, 30e3, 400e3], tiktok: [30e3, 900e3, 50e3, 500e3], instagram: [20e3, 400e3, 50e3, 600e3], substack: [2e3, 30e3, 100e3, 1.5e6], live: [5e3, 120e3, 200e3, 2e6], linkedin: [3e3, 60e3, 30e3, 300e3] }[platform];
  return { platform, followers: Math.round(base[0] + b[0] * (base[1] - base[0])), monthlyRevenue: Math.round((base[2] + b[1] * (base[3] - base[2])) / 1000) * 1000, engagement: +(1.5 + b[2] * 7).toFixed(1), growth: +(-1 + b[3] * 6).toFixed(1) };
}
