import Link from "next/link";
/** Shared PATRON footer (Unisocks style): 3 market links. */
export default function SiteFooter() {
  return (
    <footer className="pf">
      <nav>
        <Link href="/">PATRON</Link>
        <Link href="/twins">Digital Twin Market <i>Soon</i></Link>
        <Link href="/markets">Spot · Perp Market</Link>
        <Link href="/exchange">PATRON PERP Exchange</Link>
      </nav>
      <p>© PATRON · Sei</p>
    </footer>
  );
}
