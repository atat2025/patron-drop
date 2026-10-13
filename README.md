# PATRON drop (standalone)

Unisocks-style purchase page for **PATRON Edition 0** on **Sei EVM testnet** (atlantic-2, chain 1328). Testnet only, no real value.

- Market `0xB4Bf3BbA6BD96D8C1736940c75d85E4EA4b02039`, token `0x322d1A62ca7505827baedC726949168Ff06b106f`
- Live buy / sell / redeem via an injected wallet, price chart from on-chain Bought/Sold events (falls back to the curve), staking panel is **DEMO** (no contract).
- `?embed=1` hides the header for iframes.

```
npm ci && npm run build   # static site in out/
npm start                 # serve out/ on :3001
```
Domain: set **one** value, `NEXT_PUBLIC_SITE_URL` (e.g. `https://patron.red/drop` or `https://drop.patron.red`). basePath, canonical and OG URLs are derived from it (`src/site.config.mjs`). GitHub Pages deploy: `.github/workflows/pages.yml`.
