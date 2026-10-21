import Link from "next/link";
import Mustache from "@/components/Mustache";
export const metadata = { title: "PATRON Markets" };
export default function Page() {
  return (
    <div className="pd">
      <header className="pd-top"><Link className="pd-brand" href="/"><Mustache size={22} /><span>patron<i>_</i></span></Link></header>
      <main className="pd-main">
        <div className="pd-card-h mk-h"><h1>Spot・Perp Market</h1></div>
        <Link href="/stocks" className="mk-c"><b>A · Personal Stock Market</b><span>Tokenized creator shares</span><em>Coming Soon</em></Link>
        <Link href="/exchange" className="mk-c live"><b>B · Stocks & Crypto Spot / Perp</b><span>Sei · Powered by Monaco</span><em>Live (testnet) →</em></Link>
      </main>
    </div>
  );
}
