"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: [string, string][] = [["/", "Home"], ["/perp/", "PERP"], ["/spot/", "Spot"], ["/vault/", "Automated trading"], ["/bridge/", "Bridge"]];

export default function SiteNav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (path.startsWith("/admin") || path.startsWith("/testnet")) return null;
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h.replace(/\/$/, "")));
  return (
    <nav className="sn">
      <div className="sn-in">
        <div className="sn-links">{LINKS.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : ""}>{l}</Link>)}</div>
        <button className="sn-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><span /><span /><span /></button>
      </div>
      {open && <div className="sn-drop">{LINKS.map(([h, l]) => <Link key={h} href={h} className={on(h) ? "on" : ""}>{l}</Link>)}</div>}
    </nav>
  );
}
