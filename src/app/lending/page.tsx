export const metadata = { title: "PATRON Lending · YouTube Revenue Financing", description: "Turn your future YouTube revenue into capital. PATRON Lending is in development." };
const H2: React.CSSProperties = { fontSize: 22, margin: "36px 0 10px" };
export default function Page() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 64px", lineHeight: 1.65 }}>
      <img src="/lending/banner.webp" alt="PATRON LENDING" style={{ width: "100%", borderRadius: 18, display: "block" }} />
      <h1 style={{ fontSize: 34, margin: "28px 0 6px" }}>PATRON Lending: YouTube Revenue Financing</h1>
      <p style={{ fontSize: 19, opacity: .85, margin: 0 }}>Turn your future YouTube revenue into capital.</p>
      <h2 style={H2}>Status</h2>
      <p>PATRON Lending is in development. It is not yet open to applications. No funds are being lent through this service today.</p>
      <h2 style={H2}>What it is</h2>
      <p>PATRON Lending is a service that gives creators an advance against the future advertising revenue of a monetized YouTube channel. You connect your channel with read-only access through Google sign-in. We look at your published channel data and show an indicative value and a funding range. Repayment is a set percentage of your future monthly revenue, and the total repayment is capped.</p>
      <h2 style={H2}>How it will work (planned)</h2>
      <ol>
        <li><b>Connect:</b> sign in with Google and grant read-only access to your channel data.</li>
        <li><b>Estimate:</b> see an indicative value and funding range. Figures are estimates only.</li>
        <li><b>Choose terms:</b> pick an amount and a repayment period, and review the full terms.</li>
        <li><b>Receive funds:</b> funds are sent in stablecoin (USDC) or fiat, subject to final arrangements.</li>
        <li><b>Repay automatically:</b> repayments come out of monthly revenue. Your revenue can go down, and so can your repayment.</li>
      </ol>
      <figure style={{ margin: "24px 0" }}>
        <img src="/lending/app-flow.webp" alt="PATRON Lending concept app screens" style={{ width: "100%", borderRadius: 14, display: "block" }} />
        <figcaption style={{ fontSize: 13, opacity: .7, marginTop: 8 }}>Concept screens. All figures are samples.</figcaption>
      </figure>
      <h2 style={H2}>What we will not do</h2>
      <ul>
        <li>We will not ask for your passwords.</li>
        <li>We will not take a personal guarantee or company shares.</li>
        <li>We will not post or change anything on your channel.</li>
      </ul>
      <h2 style={H2}>Important information</h2>
      <p style={{ fontSize: 14, opacity: .8 }}>Terms, fees, repayment ratios, eligibility, and supported regions are not final and will be announced when confirmed. Funding depends on approvals and is not guaranteed. Digital assets can be volatile and may result in loss of principal. This page is not an offer or solicitation.</p>
      <h2 style={H2}>Contact</h2>
      <p><a href="mailto:hello@patron.red">hello@patron.red</a> · <a href="https://www.linkedin.com/company/patron-ico/" target="_blank" rel="noopener">LinkedIn</a> · <a href="https://github.com/atat2025" target="_blank" rel="noopener">GitHub</a></p>
      <a href="mailto:hello@patron.red?subject=PATRON%20Lending%20waitlist" style={{ display: "inline-block", marginTop: 12, padding: "14px 26px", borderRadius: 12, background: "#7b5cff", color: "#fff", fontWeight: 600, textDecoration: "none" }}>Join the waitlist</a>
    </main>
  );
}
