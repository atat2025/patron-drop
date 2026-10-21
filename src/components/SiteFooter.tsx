import Link from "next/link";
/** Shared PATRON footer (Unisocks style). */
export default function SiteFooter() {
  return (
    <footer className="pf">
      <nav>
        <Link href="/">PATRON</Link>
        <Link href="/pat/">Buy PAT</Link>
        <Link href="/vault/">Automated trading</Link>
        <Link href="/bridge/">Bridge</Link>
      </nav>
      <p>© PATRON · Sei</p>
    </footer>
  );
}
