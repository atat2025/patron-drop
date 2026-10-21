// PATRON plans keeper (Sei MAINNET, PlanVault x3). Runs once per call (box loop every 3h).
// env: KEEPER_PRIVATE_KEY, LOG_OUT (json path). Idles (no tx) while a plan has no deposits.
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = "https://evm-rpc.sei-apis.com";
const chain = { id: 1329, name: "Sei", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
export const PLANS = [
  { id: "pat", address: "0xb243ccdb1a260f593915d9d767a0d4022d1a3453" },
  { id: "usdc", address: "0x2f3f05828572394aace80d9661bc665b071f78a8" },
  { id: "sei", address: "0x757afab1d28506d46ca5c4caed2e81f20a6c98fd" },
];
const abi = parseAbi([
  "function summary() view returns (uint256 navOut, uint256 sei, uint256 usdcBal, uint256 patBal, uint256 totalShares, uint256 pps, uint256 seiPerUsdc, uint256 patPriceSei, uint256 nRecs, address keeper, bool paused)",
  "function lastTradeAt() view returns (uint256)", "function minTradeInterval() view returns (uint256)",
  "function maxSeiIn() view returns (uint256)", "function maxUsdcIn() view returns (uint256)", "function maxPatIn() view returns (uint256)",
  "function usdcForSei(uint256) view returns (uint256)", "function seiForUsdc(uint256) view returns (uint256)", "function seiForPat(uint256) view returns (uint256)",
  "function swapSeiToUsdc(uint256 seiIn, uint256 minOut)", "function swapUsdcToSei(uint256 usdcIn, uint256 minOut)",
  "function sellPat(uint256 patIn, uint256 minOut)", "function buyPat(uint256 patOut, uint256 maxCost)", "function checkpoint()",
]);
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4, retryDelay: 800 }) });
if ((await pub.getChainId()) !== 1329) throw new Error("not Sei mainnet");
const LOG_OUT = process.env.LOG_OUT || "plan-log.json";
const log = fs.existsSync(LOG_OUT) ? JSON.parse(fs.readFileSync(LOG_OUT, "utf8")) : { samples: [], entries: [] };
const key = process.env.KEEPER_PRIVATE_KEY;
const account = key ? privateKeyToAccount(key) : null;
const w = account ? createWalletClient({ account, chain, transport: http(RPC) }) : null;
const gas = account ? await pub.getBalance({ address: account.address }) : 0n;
if (account) console.log(`plan keeper ${account.address} gas ${formatEther(gas)} SEI`);
const MIN_GAS = 50000000000000000n; // keep 0.05 SEI
const now = Math.floor(Date.now() / 1000);
const min = (a, b) => (a < b ? a : b);
const avg = (k) => { const s = log.samples.filter((x) => now - x.t < 86400 && x[k] > 0).map((x) => x[k]); return s.length >= 3 ? s.reduce((a, b) => a + b, 0) / s.length : 0; };

const r0 = await pub.readContract({ address: PLANS[0].address, abi, functionName: "summary" });
const seiUsd = 1e18 / Number(r0[6]); // USD per SEI (USDC = $1)
const patSei = Number(formatEther(r0[7]));
log.samples.push({ t: now, seiUsd, patSei });
log.samples = log.samples.slice(-200);
const seiAvg = avg("seiUsd"), patAvg = avg("patSei");

async function send(address, functionName, args) {
  const h = await w.writeContract({ address, abi, functionName, args, account, chain });
  const r = await pub.waitForTransactionReceipt({ hash: h });
  if (r.status !== "success") throw new Error(`reverted ${h}`);
  return h;
}

for (const p of PLANS) {
  const s = await pub.readContract({ address: p.address, abi, functionName: "summary" });
  const [nav, sei, usdc, pat, shares, pps, , , , , paused] = s;
  const e = { t: new Date().toISOString(), plan: p.id, pps: Number(pps) / 1e18, seiUsd, patSei, action: null, why: "" };
  if (shares === 0n) { e.why = "waiting for the first deposit"; console.log(JSON.stringify(e)); log.entries.push(e); continue; }
  const [last, gap, maxSei, maxUsdc, maxPat] = await Promise.all(["lastTradeAt", "minTradeInterval", "maxSeiIn", "maxUsdcIn", "maxPatIn"].map((f) => pub.readContract({ address: p.address, abi, functionName: f })));
  let act = null;
  const seiVal = Number(formatEther(sei)) * seiUsd, usdcVal = Number(formatUnits(usdc, 6)), patVal = Number(formatEther(pat)) * patSei * seiUsd;
  const total = seiVal + usdcVal + patVal || 1;
  if (!seiAvg) e.why = "learning the price (needs a few checks)";
  else if (p.id === "sei") {
    if (seiUsd > seiAvg * 1.02 && usdcVal / total < 0.5) act = ["swapSeiToUsdc", min(sei / 10n, maxSei), "SEI is up, keep some gains in USDC"];
    else if (seiUsd < seiAvg * 0.98 && usdc > 0n) act = ["swapUsdcToSei", min(usdc / 4n, maxUsdc), "SEI is down, buy some back"];
    else e.why = "price is calm, waiting";
  } else if (p.id === "usdc") {
    if (seiUsd < seiAvg * 0.98 && seiVal / total < 0.3) act = ["swapUsdcToSei", min(usdc / 10n, maxUsdc), "SEI is cheap, buy a little"];
    else if (seiUsd > seiAvg * 1.02 && sei > 0n) act = ["swapSeiToUsdc", min(sei, maxSei), "SEI went up, take the gain in USDC"];
    else e.why = "price is calm, waiting";
  } else {
    if (sei > 10n ** 16n) act = ["swapSeiToUsdc", min(sei, maxSei), "turn PATRON gains into USDC"];
    else if (patAvg && patSei > patAvg * 1.02 && pat > 0n) act = ["sellPat", min(pat / 10n, maxPat), "PATRON is up, sell a little"];
    else e.why = patAvg ? "price is calm, waiting" : "learning the price (needs a few checks)";
  }
  if (act && act[1] === 0n) act = null;
  if (act && Number(last) && now < Number(last) + Number(gap)) { e.why = act[2] + " · waiting (cooldown)"; act = null; }
  try {
    if (paused) e.why = "paused by owner";
    else if (!account || gas < MIN_GAS) e.why += act ? " · skipped (keeper low on gas)" : "";
    else if (act) {
      // the contract enforces its own 1.5% price guard against the 10-min average; minOut 0 defers to it
      e.tx = await send(p.address, act[0], [act[1], 0n]); e.action = act[0]; e.why = act[2];
    } else if (now - (log.entries.filter((x) => x.plan === p.id && x.tx).slice(-1)[0]?.ts || 0) > 6 * 3600) {
      e.tx = await send(p.address, "checkpoint", []); e.checkpoint = true; e.ts = now;
    }
    if (e.tx && !e.ts) e.ts = now;
  } catch (err) { e.error = (err.shortMessage || err.message || String(err)).slice(0, 200); }
  console.log(JSON.stringify(e)); log.entries.push(e);
}
log.entries = log.entries.slice(-500);
fs.writeFileSync(LOG_OUT, JSON.stringify(log));
