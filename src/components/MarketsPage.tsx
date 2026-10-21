"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Mustache from "./Mustache";
import { logoOf, NAMES } from "@/lib/marketMeta";
import { loadMarketsByType, enrichMarkets } from "@/lib/monaco";
import { readCurve } from "@/lib/patCurve";
import { useSeiUsd, fmtUsd } from "@/lib/seiUsd";
import type { Market } from "@/lib/types";

const EQ = ["NVDA", "TSLA", "AAPL", "MSFT", "HOOD", "SPCX", "AMZN", "GOOG", "META", "AMD", "COIN", "MSTR", "TSM", "INTC"];
const DA = ["BTC", "ETH", "SEI", "SOL", "HYPE"];
// Person-themed memecoins (CoinMarketCap ids/slugs; prices from CoinGecko, which allows browser requests).
const HUMAN = [
  { cmc: 35336, slug: "official-trump", cg: "official-trump", sym: "TRUMP", name: "Official Trump", who: "Donald Trump" },
  { cmc: 38151, slug: "yzy", cg: "yzy", sym: "YZY", name: "YZY Money", who: "Kanye West (Ye)" },
  { cmc: 35347, slug: "melania-meme", cg: "melania-meme", sym: "MELANIA", name: "Official Melania Meme", who: "Melania Trump" },
  { cmc: 9436, slug: "dogelon", cg: "dogelon-mars", sym: "ELON", name: "Dogelon Mars", who: "Elon Musk (fan)" },
  { cmc: 42044, slug: "hunter-biden-s-laptop", cg: "hunter-biden-s-laptop-3", sym: "LAPTOP", name: "Hunter Biden's Laptop", who: "Hunter Biden" },
  { cmc: 35011, slug: "kekius-maximus-vip", cg: "kekius-maximus", sym: "KEKIUS", name: "Kekius Maximus", who: "Elon Musk's X alias" },
  { cmc: 35436, slug: "alon", cg: "alon", sym: "ALON", name: "Alon", who: "Alon Cohen (pump.fun co-founder)" },
  { cmc: 35181, slug: "elon-trump-fart", cg: "elon-trump-fart", sym: "ETF500", name: "Elon Trump Fart", who: "Elon Musk & Donald Trump" },
];
const nm = (b: string) => (b === "SPCX" ? "SpaceX" : (NAMES[b] ?? b).replace(/\s[^\x00-\x7F].*$/, ""));
const fp = (x: number) => (!x ? "—" : "$" + (x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(2) : (x < 1e-4 ? x.toExponential(2) : x.toPrecision(3))));

function Row({ href, ext, logo, sym, name, price, chg, soon }: { href?: string; ext?: boolean; logo: React.ReactNode; sym: string; name: string; price?: string; chg?: number; soon?: boolean }) {
  const inner = <>
    <span className="mkp-coin">{logo}</span>
    <span className="mkp-n"><b>{sym}</b><small>{name}</small></span>
    <span className="mkp-p">{soon ? <em className="mkp-soon">Coming soon</em> : <><b>{price ?? "—"}</b>{chg !== undefined && <small className={chg >= 0 ? "up" : "dn"}>{`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</small>}</>}</span>
  </>;
  if (href && ext) return <a href={href} target="_blank" rel="noopener noreferrer" className="mkp-row">{inner}</a>;
  return href ? <Link href={href} className="mkp-row">{inner}</Link> : <div className="mkp-row off">{inner}</div>;
}

export default function MarketsPage() {
  const [ms, setMs] = useState<Market[]>([]);
  const [pat, setPat] = useState<number>(0);
  const [hp, setHp] = useState<Record<string, { usd?: number; usd_24h_change?: number | null }>>({});
  const { usd } = useSeiUsd();
  useEffect(() => {
    let on = true;
    loadMarketsByType("MARGIN").then((r) => { if (!on) return; setMs(r.markets); enrichMarkets(r.markets, (u) => on && setMs((a) => a.map((x) => (x.id === u.id ? u : x)))); });
    const hl = () => fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${HUMAN.map((h) => h.cg).join(",")}&vs_currencies=usd&include_24hr_change=true`).then((r) => r.json()).then((d) => on && d && !d.status && setHp(d)).catch(() => {});
    hl(); const iv = setInterval(hl, 120000);
    readCurve().then((c) => on && setPat(Number(c.price) / 1e18)).catch(() => {});
    return () => { on = false; clearInterval(iv); };
  }, []);
  const by = (b: string) => ms.find((m) => m.base === b);
  const img = (b: string) => { const s = logoOf(b); return s ? <img src={s} alt="" /> : <i>{b[0]}</i>; };
  const list = (bases: string[]) => bases.map((b) => { const m = by(b); return <Row key={b} href={`/perp/?market=${b}`} logo={img(b)} sym={b === "SPCX" ? "SpaceX" : b} name={nm(b)} price={m ? fp(m.price) : undefined} chg={m?.change24h} />; });

  return (
    <div className="pd mkp">
      <header className="pd-top"><Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link></header>
      <main className="mkp-main">
        <span className="mkp-eye">MARKET COVERAGE</span>
        <h1>Asset classes</h1>

        <section className="mkp-g">
          <h2>Human</h2>
          {HUMAN.map((h) => { const q = hp[h.cg]; return <Row key={h.sym} href={`https://coinmarketcap.com/currencies/${h.slug}/`} ext logo={<img src={`/logos/human/cmc-${h.cmc}.png`} alt="" />} sym={h.sym} name={`${h.name} · ${h.who}`} price={q?.usd ? fp(q.usd) : undefined} chg={typeof q?.usd_24h_change === "number" ? q.usd_24h_change : undefined} />; })}
          <p className="mkp-note">Illustrative categories and coin designs. No affiliation, endorsement, listing, or live trading is implied. Logos and links reference each coin on <a href="https://coinmarketcap.com/" target="_blank" rel="noopener noreferrer">CoinMarketCap</a>; prices from CoinGecko. Many of these coins are unofficial fan tokens; the people named are not involved unless stated.</p>
        </section>

        <section className="mkp-g">
          <h2>Equities</h2>
          {list(EQ)}
        </section>

        <section className="mkp-g">
          <h2>Digital Assets</h2>
          <Row href="/" logo={<span className="mkp-pat"><Mustache size={26} /></span>} sym="PAT" name="PATRON · Sei" price={pat ? fmtUsd(pat * usd) : undefined} />
          {list(DA)}
        </section>
        <p className="mkp-note">Live prices from Monaco (Sei). Tap a market to open it. Trading opens soon.</p>
      </main>
    </div>
  );
}
