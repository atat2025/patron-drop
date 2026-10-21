import Link from "next/link";
import Mustache from "./Mustache";
export default function ComingSoon({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pd">
      <header className="pd-top"><Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link></header>
      <main className="pd-main">
        <section className="pd-card cs-card"><div className="pd-card-h"><h1>{title}</h1><p>COMING SOON</p></div>
          <div className="cs-art"><Mustache size={120} /></div></section>
        <div className="pd-info">{sub}</div>
        <Link className="pd-buy cs-btn" href="/exchange">Go to PATRON Exchange</Link>
      </main>
    </div>
  );
}
