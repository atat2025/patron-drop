import Link from "next/link";

// Avatars are crops of our own hero image or abstract gradients — no real people.
const AV = [
  { s: 64, top: 14, left: 16, r: "#ff5c86", bg: "url(/digitaltwin-hero.webp) 28% 38% / 320%" },
  { s: 46, top: 24, right: 22, r: "#3aa0ff", bg: "radial-gradient(circle at 35% 30%,#d6ecff,#3aa0ff 55%,#0b2b52)" },
  { s: 38, top: 128, right: 12, r: "#9b5cff", bg: "url(/digitaltwin-hero.webp) 72% 36% / 360%" },
  { s: 34, top: 150, left: 10, r: "#f5b301", bg: "radial-gradient(circle at 35% 30%,#fff2c2,#f5b301 55%,#5a3d00)" },
];
const BARS = Array.from({ length: 48 }, (_, i) => 30 + Math.round(70 * Math.abs(Math.sin(i * 0.7) * Math.cos(i * 0.23))));

export default function DigitalTwin() {
  return (
    <div className="dt">
      <header className="pd-top"><Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link></header>
      <main className="dt-main">
        <span className="dt-eye">DIGITALTWIN</span>
        <h1>Your AI twin <span className="dt-soon">Coming soon</span></h1>
        <p className="dt-sub">An AI twin that learns your style and works for you around the clock.</p>

        <section className="dt-glass">
          <div className="dt-hero">
            <img src="/digitaltwin-hero.webp" alt="A person and their glowing digital twin" />
            {AV.map((a, i) => <span key={i} className="dt-av" style={{ width: a.s, height: a.s, top: a.top, left: a.left, right: a.right, background: a.bg, ["--r" as string]: a.r }} />)}
          </div>
          <div className="dt-stat"><b>24/7</b><span>Your twin keeps working<br />while you sleep</span></div>
          <div className="dt-bars">{BARS.map((h, i) => <i key={i} style={{ height: h + "%", opacity: 0.35 + (i / BARS.length) * 0.65 }} />)}</div>
          <div className="dt-row"><span>Learns from you</span><span>Acts like you</span></div>
        </section>

        <section className="dt-glass">
          <ul className="dt-list">
            <li><span className="dt-ic">✦</span>Learns your voice and taste<em>soon</em></li>
            <li><span className="dt-ic">◎</span>Replies and posts for you<em>soon</em></li>
            <li><span className="dt-ic">↗</span>Follows markets you care about<em>soon</em></li>
            <li><span className="dt-ic">⚑</span>Asks before anything important<em>soon</em></li>
          </ul>
        </section>

        <Link href="/" className="dt-btn">Back to PATRON</Link>
      </main>
    </div>
  );
}
