// PATRON price-sync keeper (Sei mainnet). Keeps the DragonSwap PAT/WSEI 0.3% pool in line with PatCurve.
//  A) pool sells PAT dearer than... pool BID > curve ASK: buy PAT on PatCurve, sell into pool  -> SEI flows into the curve.
//  B) pool ASK < curve BID: buy PAT from pool, sell to PatCurve.
// Uses ONLY the keeper's own SEI, capped per run; every leg simulated first; skips unless profit after gas >= MIN_PROFIT.
// Never touches LP NFTs (only calls router/curve/quoter). env: KEEPER_PRIVATE_KEY, LOG_OUT, DRY=1 (simulate only), RPC
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, formatEther, encodeFunctionData, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC = process.env.RPC || "https://evm-rpc.sei-apis.com";
const chain = { id: 1329, name: "Sei", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const CURVE = "0x88b1de8c7C04905f3c16bd67B6ED8a75075fC99B", PAT = "0x3d9C71B7f7907e842a3Bbf7e07d9954fB6a44e95", WSEI = "0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7";
const ROUTER = "0x11DA6463D6Cb5a03411Dbf5ab6f6bc3997Ac7428", QUOTER = "0x38F759cf0Af1D0dcAEd723a3967A3B658738eDe9", FEE = 3000;
const MAX_SEI = parseEther(process.env.MAX_SEI || "2");          // max SEI spent per run
const MIN_PROFIT = parseEther(process.env.MIN_PROFIT || "0.01"); // net of gas
const GAS_FLOOR = parseEther("1");                                // never spend below this keeper balance
const curveAbi = parseAbi(["function quoteBuy(uint256) view returns (uint256 cost, uint256 fee)", "function quoteSell(uint256) view returns (uint256 gross, uint256 fee)",
  "function buy(uint256 amount, uint256 maxCost, uint256 deadline) payable", "function sell(uint256 amount, uint256 minReturn, uint256 deadline)", "function spotPrice() view returns (uint256)", "function state() view returns (uint256,uint256,uint256,uint256,uint256,bool)"]);
const qAbi = parseAbi(["struct QI { address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96; }", "struct QO { address tokenIn; address tokenOut; uint256 amount; uint24 fee; uint160 sqrtPriceLimitX96; }",
  "function quoteExactInputSingle(QI params) returns (uint256 amountOut, uint160, uint32, uint256)", "function quoteExactOutputSingle(QO params) returns (uint256 amountIn, uint160, uint32, uint256)"]);
const rAbi = parseAbi(["struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(P params) payable returns (uint256)", "function unwrapWSEI(uint256 amountMinimum, address recipient) payable", "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[])"]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);

for (const ev of ["unhandledRejection", "uncaughtException"]) process.on(ev, (err) => { console.log(JSON.stringify({ t: new Date().toISOString(), action: "error", err: String(err?.shortMessage || err?.message || err).split("\n")[0] })); process.exit(0); });
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 3, retryDelay: 600 }) });
const account = privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY);
const w = createWalletClient({ account, chain, transport: http(RPC) });
const me = account.address, DRY = process.env.DRY === "1";
const LOG_OUT = process.env.LOG_OUT || "price-sync-log.json";
const log = fs.existsSync(LOG_OUT) ? JSON.parse(fs.readFileSync(LOG_OUT, "utf8")) : { entries: [] };
const e = { t: new Date().toISOString(), action: "none" };
const dl = () => BigInt(Math.floor(Date.now() / 1000) + 300);
const f = (v) => Number(formatEther(v)).toFixed(6);
const gasPrice = await pub.getGasPrice();
const GAS_A = 450_000n, GAS_B = 450_000n; // conservative per-cycle gas (2 legs)

const qIn = async (tokenIn, tokenOut, amountIn) => { try { return (await pub.simulateContract({ address: QUOTER, abi: qAbi, functionName: "quoteExactInputSingle", args: [{ tokenIn, tokenOut, amountIn, fee: FEE, sqrtPriceLimitX96: 0n }] })).result[0]; } catch { return 0n; } };
const curveAsk = async (x) => { const [c, fe] = await pub.readContract({ address: CURVE, abi: curveAbi, functionName: "quoteBuy", args: [x] }); return c + fe; };
const curveBid = async (x) => { try { const [g, fe] = await pub.readContract({ address: CURVE, abi: curveAbi, functionName: "quoteSell", args: [x] }); return g - fe; } catch { return 0n; } };

const bal = await pub.getBalance({ address: me });
const budget = bal - GAS_FLOOR < MAX_SEI ? bal - GAS_FLOOR : MAX_SEI;
e.keeperSei = f(bal); e.curvePrice = f(await pub.readContract({ address: CURVE, abi: curveAbi, functionName: "spotPrice" }));
const one = parseEther("1");
e.poolBid = f(await qIn(PAT, WSEI, one)); // SEI for selling 1 PAT into pool
const patFor1 = await qIn(WSEI, PAT, parseEther("0.1")); e.poolAsk = patFor1 ? f((parseEther("0.1") * one) / patFor1) : "n/a";
if (budget <= 0n) { e.action = "skip: keeper SEI too low"; finish(); }

// candidate sizes by SEI spend
const sizes = [0.05, 0.1, 0.25, 0.5, 1, 2].map((s) => parseEther(String(s))).filter((s) => s <= budget);
let best = null;
for (const spend of sizes) {
  // A: buy on curve with ~spend, sell into pool
  const px = await pub.readContract({ address: CURVE, abi: curveAbi, functionName: "spotPrice" });
  let x = (spend * one) / px; x -= x % 10n ** 12n;
  if (x > 0n) { const cost = await curveAsk(x); const out = await qIn(PAT, WSEI, x); const p = out - cost - GAS_A * gasPrice;
    if (cost <= budget && (!best || p > best.p)) best = { dir: "A", x, cost, out, p }; }
  // B: buy from pool with spend, sell to curve
  const got = await qIn(WSEI, PAT, spend);
  if (got > 0n) { const back = await curveBid(got); const p = back - spend - GAS_B * gasPrice; if (!best || p > best.p) best = { dir: "B", x: got, cost: spend, out: back, p }; }
}
e.best = best ? { dir: best.dir, pat: f(best.x), spend: f(best.cost), get: f(best.out), netProfit: f(best.p) } : null;
if (!best || best.p < MIN_PROFIT) { e.action = "skip: prices in line"; finish(); }
if (DRY) { e.action = `dry-run: would do ${best.dir}`; finish(); }

const wait = async (h) => { const r = await pub.waitForTransactionReceipt({ hash: h }); if (r.status !== "success") throw new Error("tx reverted " + h); return h; };
const ensureAllow = async (spender, amt) => { if ((await pub.readContract({ address: PAT, abi: erc20, functionName: "allowance", args: [me, spender] })) < amt) await wait(await w.writeContract({ address: PAT, abi: erc20, functionName: "approve", args: [spender, 2n ** 255n] })); };
const sellToPoolCalls = (x, minOut) => [encodeFunctionData({ abi: rAbi, functionName: "exactInputSingle", args: [{ tokenIn: PAT, tokenOut: WSEI, fee: FEE, recipient: "0x0000000000000000000000000000000000000002", amountIn: x, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] }),
  encodeFunctionData({ abi: rAbi, functionName: "unwrapWSEI", args: [minOut, me] })];
try {
  const txs = [];
  if (best.dir === "A") {
    const maxCost = (best.cost * 1002n) / 1000n;
    txs.push(await wait(await w.writeContract({ address: CURVE, abi: curveAbi, functionName: "buy", args: [best.x, maxCost, dl()], value: maxCost })));
    await ensureAllow(ROUTER, best.x);
    const minOut = best.cost + GAS_A * gasPrice; // second leg must at least repay cost + gas
    txs.push(await wait(await w.writeContract({ address: ROUTER, abi: rAbi, functionName: "multicall", args: [dl(), sellToPoolCalls(best.x, minOut)] })));
  } else {
    const minPat = (best.x * 998n) / 1000n;
    const buyPool = encodeFunctionData({ abi: rAbi, functionName: "exactInputSingle", args: [{ tokenIn: WSEI, tokenOut: PAT, fee: FEE, recipient: me, amountIn: best.cost, amountOutMinimum: minPat, sqrtPriceLimitX96: 0n }] });
    txs.push(await wait(await w.writeContract({ address: ROUTER, abi: rAbi, functionName: "multicall", args: [dl(), [buyPool]], value: best.cost })));
    const patBal = await pub.readContract({ address: PAT, abi: erc20, functionName: "balanceOf", args: [me] });
    const amt = patBal < best.x ? patBal : best.x; const sellAmt = amt - (amt % 10n ** 12n);
    await ensureAllow(CURVE, sellAmt);
    txs.push(await wait(await w.writeContract({ address: CURVE, abi: curveAbi, functionName: "sell", args: [sellAmt, best.cost + GAS_B * gasPrice, dl()] })));
  }
  e.action = `traded ${best.dir}`; e.txs = txs;
} catch (err) { e.action = "error"; e.err = String(err.message || err).split("\n")[0]; }
e.keeperSeiAfter = f(await pub.getBalance({ address: me }));
finish();

function finish() {
  console.log(JSON.stringify(e));
  log.entries.push(e); log.entries = log.entries.slice(-2000);
  fs.writeFileSync(LOG_OUT, JSON.stringify(log, null, 1));
  process.exit(0);
}
