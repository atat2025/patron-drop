import Link from "next/link";

// Avatars are crops of our own hero image or abstract gradients — no real people.
// Avatars are crops of our own hero image or abstract gradients — no real people.
const AV = [
  { s: 58, top: 10, left: 14, r: "#ff5c86", bg: "url(/dt-twin.webp) center / cover" },
  { s: 44, top: 22, right: 18, r: "#3aa0ff", bg: "radial-gradient(circle at 35% 30%,#d6ecff,#3aa0ff 55%,#0b2b52)" },
  { s: 52, top: 150, right: 6, r: "#9b5cff", bg: "url(/dt-net.webp) center / cover" },
  { s: 38, top: 168, left: 8, r: "#f5b301", bg: "radial-gradient(circle at 35% 30%,#fff2c2,#f5b301 55%,#5a3d00)" },
];

export default function DigitalTwin() {
  return (
    <div className="dt">
      <header className="pd-top"><Link className="pd-brand" href="/"><span>patron<i>_</i></span></Link></header>
      <main className="dt-main">
        <span className="dt-eye">DIGITALTWIN</span>
        <h1>Your AI twin <span className="dt-soon">Coming soon</span></h1>
        <p className="dt-sub">An AI twin that learns your style and works for you around the clock.</p>

        <section className="dt-glass">
          <div className="dt-stage">
            <span className="dt-big"><img src="/dt-face.webp" alt="A digital twin portrait" /></span>
            {AV.map((a, i) => <span key={i} className="dt-av" style={{ width: a.s, height: a.s, top: a.top, left: a.left, right: a.right, background: a.bg, ["--r" as string]: a.r }} />)}
          </div>
          <h2 className="dt-h2">Your Digital Twin</h2>
          <p className="dt-cap">Learns from you. Acts like you. <span className="dt-soon">Coming soon</span></p>
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
