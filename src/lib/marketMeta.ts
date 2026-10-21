// Self-hosted official brand logos (copied from Monaco's asset CDN into /public/logos) + search aliases.
const EXT: Record<string, string> = { AMD: "png", GME: "png", GOLD: "png", INTC: "png", MRVL: "png", NATGAS: "png", SILVER: "png", SNDK: "png", SPCX: "png", GOOG: "jpg" };
const HAVE = "AAPL AMD AMZN BTC CBRS COIN COPPER ETH EUR FARTCOIN GBP GME GOLD GOOG HOOD HYPE INTC LIT META MRVL MSFT MSTR MU NATGAS NVDA SEI SILVER SNDK SOL SOXL SPCX SPX TSLA TSM".split(" ");
export const NAMES: Record<string, string> = {
  AAPL: "Apple アップル", AMD: "AMD Advanced Micro Devices", AMZN: "Amazon アマゾン", BTC: "Bitcoin ビットコイン", CBRS: "Cerebras セレブラス",
  COIN: "Coinbase コインベース", COPPER: "Copper 銅 カッパー", ETH: "Ethereum イーサリアム", EUR: "Euro ユーロ", FARTCOIN: "Fartcoin",
  GBP: "British Pound ポンド", GME: "GameStop ゲームストップ", GOLD: "Gold 金 ゴールド", GOOG: "Google Alphabet グーグル", HOOD: "Robinhood ロビンフッド",
  HYPE: "Hyperliquid ハイパーリキッド", INTC: "Intel インテル", LIT: "Lighter", META: "Meta Facebook メタ", MRVL: "Marvell マーベル",
  MSFT: "Microsoft マイクロソフト", MSTR: "MicroStrategy Strategy マイクロストラテジー", MU: "Micron マイクロン", NATGAS: "Natural Gas 天然ガス",
  NVDA: "NVIDIA エヌビディア", SEI: "Sei セイ", SILVER: "Silver 銀 シルバー", SNDK: "SanDisk サンディスク", SOL: "Solana ソラナ",
  SOXL: "Semiconductor 3x 半導体", SPCX: "SpaceX スペースX", SPX: "S&P 500", TSLA: "Tesla テスラ", TSM: "TSMC Taiwan Semiconductor 台湾積体電路",
};
export const logoOf = (b: string) => (HAVE.includes(b) ? `/logos/${b}.${EXT[b] ?? "svg"}` : null);
const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/\s+/g, "");
export const matches = (base: string, symbol: string, q: string) => !q.trim() || norm(`${symbol} ${base} ${NAMES[base] ?? ""}`).includes(norm(q));
