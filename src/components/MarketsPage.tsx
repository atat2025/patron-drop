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
const HUMAN = [
  { img: "/logos/human/trump.png", name: "TRUMP", sub: "Official Trump" },
  { img: "/logos/human/melania.png", name: "MELANIA", sub: "Melania Meme" },
  { img: "/logos/human/mrbeast.jpg", name: "MrBeast", sub: "Creator" },
];
const nm = (b: string) => (b === "SPCX" ? "SpaceX" : (NAMES[b] ?? b).replace(/\s[^\x00-\x7F].*$/, ""));
const fp = (x: number) => (!x ? "—" : "$" + (x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(2) : x.toPrecision(3)));

function Row({ href, logo, sym, name, price, chg, soon }: { href?: string; logo: React.ReactNode; sym: string; name: string; price?: string; chg?: number; soon?: boolean }) {
  const inner = <>
    <span className="mkp-coin">{logo}</span>
    <span className="mkp-n"><b>{sym}</b><small>{name}</small></span>
    <span className="mkp-p">{soon ? <em className="mkp-soon">Coming soon</em> : <><b>{price ?? "—"}</b>{chg !== undefined && <small className={chg >= 0 ? "up" : "dn"}>{`${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}</small>}</>}</span>
  </>;
  return href ? <Link href={href} className="mkp-row">{inner}</Link> : <div className="mkp-row off">{inner}</div>;
}

export default function MarketsPage() {
  const [ms, setMs] = useState<Market[]>([]);
  const [pat, setPat] = useState<number>(0);
  const { usd } = useSeiUsd();
  useEffect(() => {
    let on = true;
    loadMarketsByType("MARGIN").then((r) => { if (!on) return; setMs(r.markets); enrichMarkets(r.markets, (u) => on && setMs((a) => a.map((x) => (x.id === u.id ? u : x)))); });
    readCurve().then((c) => on && setPat(Number(c.price) / 1e18)).catch(() => {});
    return () => { on = false; };
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
          {HUMAN.map((h) => <Row key={h.name} logo={<img src={h.img} alt="" />} sym={h.name} name={h.sub} soon />)}
          <p className="mkp-note">Illustrative categories and coin designs. No affiliation, endorsement, listing, or live trading is implied. Logos reference <a href="https://coinmarketcap.com/currencies/official-trump/" target="_blank" rel="noopener noreferrer">TRUMP</a>, <a href="https://coinmarketcap.com/currencies/melania-meme/" target="_blank" rel="noopener noreferrer">MELANIA</a> on CoinMarketCap and <a href="https://www.youtube.com/@MrBeast" target="_blank" rel="noopener noreferrer">MrBeast on YouTube</a>.</p>
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
