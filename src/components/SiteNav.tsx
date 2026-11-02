"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { MUSTACHE_PATH } from "./Mustache";

type Tile = { img?: string; mus?: boolean; txt?: string; bg?: string; pos?: string };
const L = (b: string) => ({ img: `/logos/${b}` });
type Item = { h: string; l: string };
type Group = { l: string; h?: string; items?: Item[]; glow: string; tiles: Tile[]; sub?: string };
const NAV: Group[] = [
  { l: "PATRON PERP", glow: "#ff5c86", sub: "Human · Stock and Crypto · AI Trade", tiles: [{ img: "/logos/human/cmc-35336.png" }, L("NVDA.svg"), L("BTC.svg"), { txt: "AI", bg: "linear-gradient(135deg,#3aa0ff,#7b5cff)" }], items: [
    { h: "/markets/", l: "Human" }, { h: "/spot/", l: "Stock and Crypto · Spot" }, { h: "/perp/", l: "Stock and Crypto · Perp" }, { h: "/vault/", l: "AI Trade" }] },
  { l: "DigitalTwin", glow: "#9b5cff", tiles: [], items: [{ h: "/digitaltwin/", l: "DigitalTwin" }, { h: "/offerpad/", l: "OfferPad" }] },
  { l: "PATRON LENDING", h: "/lending/", glow: "#1f9d6b", sub: "Coming soon", tiles: [{ txt: "$", bg: "#1f9d6b" }] },
  { l: "PATRON TOKEN", glow: "#2ec4b6", tiles: [L("SEI.svg"), { txt: "⇄", bg: "#222" }, L("HOOD.svg")], items: [{ h: "/pat/", l: "Buy PAT" }, { h: "/bridge/", l: "Bridge" }] },
  { l: "Bridge", h: "/bridge/", glow: "#2ec4b6", tiles: [L("SEI.svg"), { txt: "⇄", bg: "#222" }, L("HOOD.svg")] },
];
function TileEl({ t, i }: { t: Tile; i: number }) {
  const style: React.CSSProperties = { zIndex: 10 - i, transform: `rotate(${[-6, 3, -2, 5, -4, 2][i % 6]}deg)` };
  if (t.img && t.pos) return <span className="mn-t" style={{ ...style, backgroundImage: `url(${t.img})`, backgroundSize: "300%", backgroundPosition: t.pos }} />;
  if (t.img) return <span className="mn-t mn-ti" style={style}><img src={t.img} alt="" /></span>;
  if (t.mus) return <span className="mn-t" style={{ ...style, background: "#ff0047" }}><svg viewBox="-20 -20 1405 486" width="34"><path d={MUSTACHE_PATH} fill="#fff" /></svg></span>;
  return <span className="mn-t" style={{ ...style, background: t.bg }}>{t.txt}</span>;
}

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

function Drop({ g, on }: { g: Group; on: (h: string) => boolean }) {
  const [o, setO] = useState(false);
  const active = g.items!.some((i) => on(i.h));
  return (
    <div className="sn-dd" onMouseLeave={() => setO(false)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setO(false); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setO(false); (e.currentTarget.firstChild as HTMLElement)?.focus(); } }}>
      <button type="button" className={"sn-ddb" + (active ? " on" : "")} aria-haspopup="true" aria-expanded={o} onClick={() => setO((v) => !v)}>{g.l} <span aria-hidden>▾</span></button>
      {o && <div className="sn-ddm" role="menu">{g.items!.map((i) => <Link key={i.h} href={i.h} role="menuitem" className={on(i.h) ? "on" : ""} onClick={() => setO(false)}>{i.l}</Link>)}</div>}
    </div>
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
        <Link href="/" className="sn-brand" aria-label="PATRON — Human Asset Market, home"><svg viewBox="-20 -20 1405 486" width="28" aria-hidden><path d={MUSTACHE_PATH} fill="#ff0047" /></svg><span>PATRON <i>—</i> <small>Human Asset Market</small></span></Link>
        <div className="sn-links">{NAV.map((g) => g.items ? <Drop key={g.l} g={g} on={on} /> : <Link key={g.l} href={g.h!} className={on(g.h!) ? "on" : ""}>{g.l}</Link>)}</div>
        <ThemeToggle />
        <button className="sn-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span /><span /><span /></button>
      </div>
      {open && createPortal(
        <div className="mn" role="dialog" aria-label="Menu">
          <div className="mn-top"><b>Menu</b><button className="mn-x" aria-label="Close menu" onClick={() => setOpen(false)}>×</button></div>
          <div className="mn-list">
            <Link href="/" className={"mn-c mn-home" + (path === "/" ? " on" : "")} style={{ ["--g" as string]: "#ff0047" }} onClick={() => setOpen(false)}><span className="mn-l">PATRON — Human Asset Market</span><span className="mn-tiles"><TileEl t={{ mus: true }} i={0} /></span></Link>
            {NAV.map((g) => g.items ? (
              <div key={g.l} className="mn-c mn-g" style={{ ["--g" as string]: g.glow }}>
                <span className="mn-l">{g.l}</span>
                <span className="mn-gl">{g.items.map((i) => <Link key={i.h} href={i.h} className={on(i.h) ? "on" : ""} onClick={() => setOpen(false)}>{i.l}</Link>)}</span>
              </div>
            ) : (
              <Link key={g.l} href={g.h!} className={"mn-c" + (on(g.h!) ? " on" : "")} style={{ ["--g" as string]: g.glow }} onClick={() => setOpen(false)}>
                <span className="mn-l">{g.l}</span>
                {g.sub && <span className="mn-sub">{g.sub}</span>}
                <span className="mn-tiles">{g.tiles.map((t, i) => <TileEl key={i} t={t} i={i} />)}</span>
              </Link>
            ))}
          </div>
        </div>
      , document.body)}
    </nav>
  );
}
