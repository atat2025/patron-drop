# PATRON Vault keeper (Sei testnet only)

Runs `keeper.mjs` on a schedule (GitHub Actions, `.github/workflows/keeper.yml`):

1. Indexes PatronMarket `Bought`/`Sold` events into `market-fills.json` (the purchase page chart uses it).
2. For each PatronStrategyVault, runs its rule (`strategies.mjs`: momentum, mean reversion, DCA) and, if the rule
   fires, calls `buy`/`sell` on the vault. Otherwise it records a NAV `checkpoint` every 6 h.
3. Appends the decision + reason + tx hash to `keeper-log.json`.

Output is committed to the `data` branch (no secrets). The keeper key lives only in the repo secret
`KEEPER_PRIVATE_KEY`. The vault contract only lets the keeper buy/sell PATRON on the whitelisted market with size and
cooldown limits; it cannot withdraw user funds. The script refuses to run on any chain other than 1328.

Local dry run: `cd keeper && npm i && DRY_RUN=1 FILLS_IN=/tmp/f.json LOG_OUT=/tmp/l.json node keeper.mjs`
