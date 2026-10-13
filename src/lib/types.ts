export interface Market { id: string; symbol: string; base: string; quote: string; price: number; change24h: number; volume?: number; mock?: boolean }
export interface Level { price: number; size: number }
export interface Book { bids: Level[]; asks: Level[] }
export interface TradeRow { price: number; size: number; side: "BUY" | "SELL"; time: number }
export interface Candle { t: number; o: number; h: number; l: number; c: number; v?: number }
export interface PositionRow { id: string; symbol: string; side: string; size: string; entry: string; mark: string; pnl: string; liq?: string }
export interface Stats { mark: number; index: number; high: number; low: number; volume: number; oi: number; funding: number; nextFunding: number }
