"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { MUSTACHE_PATH } from "./Mustache";

type Tile = { img?: string; mus?: boolean; txt?: string; bg?: string; pos?: string };
const L = (b: string) => ({ img: `/logos/${b}` });
const MENU: { h: string; l: string; glow: string; tiles: Tile[]; sub?: string }[] = [
  { h: "/", l: "Home", glow: "#ff0047", tiles: [{ mus: true }] },
  { h: "/markets/", l: "Markets", glow: "#f5b301", tiles: [{ img: "/logos/human/cmc-35336.png" }, L("NVDA.svg"), L("BTC.svg"), L("ETH.svg"), { img: "/logos/human/cmc-35347.png" }] },
  { h: "/vault/", l: "AI Trade", glow: "#3aa0ff", tiles: [{ txt: "AI", bg: "linear-gradient(135deg,#3aa0ff,#7b5cff)" }, { txt: "$", bg: "#1f9d6b" }] },
  { h: "/spot/", l: "Spot", glow: "#1f9d6b", tiles: [L("SEI.svg"), L("BTC.svg"), L("ETH.svg"), L("SOL.svg")] },
  { h: "/perp/", l: "Perpetual", glow: "#ff5c86", tiles: [L("AAPL.svg"), L("TSLA.svg"), L("NVDA.svg"), L("MSFT.svg"), L("GOLD.png")] },
  { h: "/digitaltwin/", l: "DigitalTwin", glow: "#9b5cff", tiles: [{ img: "/dt-face.webp" }] },
  { h: "/offerpad/", l: "OfferPad", glow: "#ff8a00", sub: "Coming soon", tiles: [] },
  { h: "/bridge/", l: "Bridge", glow: "#2ec4b6", tiles: [L("SEI.svg"), { txt: "⇄", bg: "#222" }, L("HOOD.svg")] },
];
function TileEl({ t, i }: { t: Tile; i: number }) {
  const style: React.CSSProperties = { zIndex: 10 - i, transform: `rotate(${[-6, 3, -2, 5, -4, 2][i % 6]}deg)` };
  if (t.img && t.pos) return <span className="mn-t" style={{ ...style, backgroundImage: `url(${t.img})`, backgroundSize: "300%", backgroundPosition: t.pos }} />;
  if (t.img) return <span className="mn-t mn-ti" style={style}><img src={t.img} alt="" /></span>;
  if (t.mus) return <span className="mn-t" style={{ ...style, background: "#ff0047" }}><svg viewBox="-20 -20 1405 486" width="34"><path d={MUSTACHE_PATH} fill="#fff" /></svg></span>;
  return <span className="mn-t" style={{ ...style, background: t.bg }}>{t.txt}</span>;
}

const LINKS: [string, string][] = [["/", "Home"], ["/markets/", "Markets"], ["/vault/", "AI Trade"], ["/spot/", "Spot"], ["/perp/", "Perpetual"], ["/digitaltwin/", "DigitalTwin"], ["/offerpad/", "OfferPad"], ["/bridge/", "Bridge"]];

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute("data-theme") === "dark"), []);
  const flip = () => {
    const d = !dark; setDark(d);
    if (d) document.documentElement.setAttribute("data-theme", "dark"); else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("patron-theme", d ? "dark" : "light"); } catch {}
  };
  return (
    <button className="sn-theme" onClick={flip} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      {dark
        ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>}
    </button>
  );
}

export default function SiteNav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(/[?&]menu=open\b/.test(window.location.search)), [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  if (path.startsWith("/admin")) return <div className="sn-float"><ThemeToggle /></div>;
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h.replace(/\/$/, "")));
  return (
    <nav className="sn">
      <div className="sn-in">
        <div className="sn-links">{LINKS.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : ""}>{l}</Link>)}</div>
        <ThemeToggle />
        <button className="sn-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span /><span /><span /></button>
      </div>
      {open && createPortal(
        <div className="mn" role="dialog" aria-label="Menu">
          <div className="mn-top"><b>Menu</b><button className="mn-x" aria-label="Close menu" onClick={() => setOpen(false)}>×</button></div>
          <div className="mn-list">
            {MENU.map((c) => (
              <Link key={c.h} href={c.h} className={"mn-c" + (on(c.h) ? " on" : "")} style={{ ["--g" as string]: c.glow }} onClick={() => setOpen(false)}>
                <span className="mn-l">{c.l}</span>
                {c.sub && <span className="mn-sub">{c.sub}</span>}
                <span className="mn-tiles">{c.tiles.map((t, i) => <TileEl key={i} t={t} i={i} />)}</span>
              </Link>
            ))}
          </div>
        </div>
      , document.body)}
    </nav>
  );
}
