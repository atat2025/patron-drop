import Link from "next/link";
import Mustache from "./Mustache";
export default function ComingSoon({ title, sub, hero }: { title: string; sub: string; hero?: string }) {
  return (
    <div className="pd">
      <header className="pd-top"><Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link></header>
      <main className="pd-main">
        <section className="pd-card cs-card"><div className="pd-card-h"><h1>{title}</h1><p>COMING SOON</p></div>
          {hero ? <img className="cs-hero" src={hero} alt="" /> : <div className="cs-art"><Mustache size={120} /></div>}</section>
        <div className="pd-info">{sub}</div>
        <Link className="pd-buy cs-btn" href="/">Back to PATRON</Link>
      </main>
    </div>
  );
}
