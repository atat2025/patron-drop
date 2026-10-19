// PATRON Vault keeper — Sei TESTNET only. Runs once (cron calls it on a schedule).
// env: KEEPER_PRIVATE_KEY (GitHub/Vercel secret, never committed), FILLS_IN/FILLS_OUT (paths), DRY_RUN=1 to only print.
import fs from "node:fs";
import { createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { pub, chain, assertTestnet, indexFills, readVault, vaultAbi, marketAbi } from "./lib.mjs";
import { MARKET, VAULTS, RPC } from "./config.mjs";
import { STRATEGIES } from "./strategies.mjs";

const FILLS_IN = process.env.FILLS_IN || "data/market-fills.json";
const FILLS_OUT = process.env.FILLS_OUT || FILLS_IN;
const LOG_OUT = process.env.LOG_OUT || "data/keeper-log.json";
const DRY = process.env.DRY_RUN === "1";
const MIN_GAS = 20000000000000000n; // keep 0.02 SEI for gas; skip trading below
const CHECKPOINT_EVERY = 6 * 3600;

await assertTestnet();
const prev = fs.existsSync(FILLS_IN) ? JSON.parse(fs.readFileSync(FILLS_IN, "utf8")) : null;
const idx = await indexFills(prev);
fs.mkdirSync(FILLS_OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
fs.writeFileSync(FILLS_OUT, JSON.stringify(idx));
console.log(`indexed ${idx.fills.length} market fills up to block ${idx.toBlock}`);

const key = process.env.KEEPER_PRIVATE_KEY;
const account = key ? privateKeyToAccount(key) : null;
const w = account ? createWalletClient({ account, chain, transport: http(RPC) }) : null;
const gasBal = account ? await pub.getBalance({ address: account.address }) : 0n;
if (account) console.log(`keeper ${account.address} gas ${formatEther(gasBal)} SEI`);
const now = Math.floor(Date.now() / 1000);
const hist = idx.fills.map((f) => f.sei / f.amount);
const log = fs.existsSync(LOG_OUT) ? JSON.parse(fs.readFileSync(LOG_OUT, "utf8")) : [];

async function send(address, functionName, args) {
  const gas = await pub.estimateContractGas({ address, abi: vaultAbi, functionName, args, account });
  const h = await w.writeContract({ address, abi: vaultAbi, functionName, args, gas: (gas * 12n) / 10n, account, chain });
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`tx reverted ${h}`);
  return h;
}

for (const cfg of VAULTS) {
  const v = await readVault(cfg.address);
  const p = Number(formatEther(v.price));
  const nav = Number(formatEther(v.nav));
  const buys = v.recs.filter((r) => r.kind === 1);
  const avgCost = buys.length ? buys.reduce((s, r) => s + Number(r.seiGwei) / 1e9, 0) / buys.reduce((s, r) => s + r.amount, 0) : 0;
  // signals compare fee-free prices: execution prices in fills exclude the 0.3% curve fee
  let d = STRATEGIES[cfg.id]({ p: p / 1.003, hist, v, nav, avgCost });
  const entry = { t: new Date().toISOString(), vault: cfg.id, price: p, nav, decision: d.action, amount: d.amount || 0, why: d.why };
  if (v.paused) { d = { action: null }; entry.why = "paused by owner"; }
  if (d.action && now < v.lastTradeAt + v.minTradeInterval) { entry.why += " · cooldown"; d = { action: null }; }
  if (d.action === "buy") {
    const [c, f] = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: "quoteBuy", args: [BigInt(d.amount)] });
    if (c + f > v.sei) { entry.why += " · not enough SEI"; d = { action: null }; }
  }
  try {
    if (!account || DRY || gasBal < MIN_GAS) { if (d.action || !account) entry.skipped = !account ? "no keeper key" : DRY ? "dry run" : "keeper low on gas"; }
    else if (d.action === "buy") {
      const [c, f] = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: "quoteBuy", args: [BigInt(d.amount)] });
      entry.tx = await send(cfg.address, "buy", [BigInt(d.amount), ((c + f) * 101n) / 100n]);
    } else if (d.action === "sell") {
      const [g, f] = await pub.readContract({ address: MARKET, abi: marketAbi, functionName: "quoteSell", args: [BigInt(d.amount)] });
      entry.tx = await send(cfg.address, "sell", [BigInt(d.amount), ((g - f) * 99n) / 100n]);
    } else {
      const last = v.recs.length ? v.recs[v.recs.length - 1].time : 0;
      if (now - last > CHECKPOINT_EVERY) { entry.tx = await send(cfg.address, "checkpoint", []); entry.checkpoint = true; }
    }
  } catch (e) { entry.error = (e.shortMessage || e.message || String(e)).slice(0, 200); }
  console.log(JSON.stringify(entry));
  log.push(entry);
  if (entry.tx) { const i = await indexFills(idx); idx.fills = i.fills; idx.toBlock = i.toBlock; hist.splice(0, hist.length, ...idx.fills.map((f) => f.sei / f.amount)); }
}
fs.writeFileSync(FILLS_OUT, JSON.stringify(idx));
fs.writeFileSync(LOG_OUT, JSON.stringify(log.slice(-500)));
