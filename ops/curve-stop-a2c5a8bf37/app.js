const RPC = "https://evm-rpc.sei-apis.com";
const CHAIN_ID = 1329;
const CHAIN_HEX = "0x531";
const CURVE = "0x88b1de8c7C04905f3c16bd67B6ED8a75075fC99B";
const PAT = "0x3d9C71B7f7907e842a3Bbf7e07d9954fB6a44e95";
const OWNER = "0x8d80a36cAE77589A0629721f0FC2757A4FABc951";
const SEL = {
  setPaused: "0x16c38b3c",
  withdrawInventory: "0x939f30e2",
  withdrawFees: "0x164e68de",
  approve: "0x095ea7b3",
  sell: "0xd3c9727c",
  state: "0xc19d93fb",
  quoteSell: "0xa64190c4",
  allowance: "0xdd62ed3e",
};
const $ = (id) => document.getElementById(id);
const E18 = 10n ** 18n;

function pad(hex) {
  return hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}
function encAddr(a) { return pad(a); }
function encUint(n) { return BigInt(n).toString(16).padStart(64, "0"); }
function word(data, i) { return BigInt("0x" + data.replace(/^0x/, "").slice(i * 64, (i + 1) * 64)); }
function fmt(n, d = 6) {
  const s = Number(n) / 1e18;
  return s.toLocaleString("ja-JP", { maximumFractionDigits: d });
}
function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
function decodeErr(msg, data) {
  const d = (data || "") + (msg || "");
  if (/1309a563/i.test(d)) return "IsPaused（すでに停止しています）";
  if (/118cdaa7/i.test(d)) return "オーナー以外の口座です";
  if (/c57ab57d/i.test(d)) return "ExceedsSold（売れる枚数がありません）";
  if (/e63a846f/i.test(d) || /InsufficientInventory/i.test(d)) return "在庫が足りません";
  const m = String(msg || "").split("\n")[0];
  return m.slice(0, 220);
}

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}
async function call(to, data, from) {
  const tx = { to, data };
  if (from) tx.from = from;
  return rpc("eth_call", [tx, "latest"]);
}

let account = null;
let chainId = null;
let st = null;

function dataPause() { return SEL.setPaused + encUint(1n); }
function dataWI(amt) { return SEL.withdrawInventory + encAddr(OWNER) + encUint(amt); }
function dataWF() { return SEL.withdrawFees + encAddr(OWNER); }
function dataApprove(amt) { return SEL.approve + encAddr(CURVE) + encUint(amt); }
function dataSell(amt, deadline) { return SEL.sell + encUint(amt) + encUint(0n) + encUint(deadline); }

async function loadState() {
  const raw = await call(CURVE, SEL.state);
  const allowanceRaw = await call(PAT, SEL.allowance + encAddr(OWNER) + encAddr(CURVE));
  const ownerSei = BigInt(await rpc("eth_getBalance", [OWNER, "latest"]));
  const ownerPatRaw = await call(PAT, "0x70a08231" + encAddr(OWNER));
  st = {
    inv: word(raw, 0),
    sold: word(raw, 1),
    backing: word(raw, 2),
    fees: word(raw, 3),
    price: word(raw, 4),
    paused: word(raw, 5) !== 0n,
    allowance: word(allowanceRaw, 0),
    ownerSei,
    ownerPat: word(ownerPatRaw, 0),
  };
  if (st.sold > 0n) {
    const qs = await call(CURVE, SEL.quoteSell + encUint(st.sold));
    st.sellGross = word(qs, 0);
    st.sellFee = word(qs, 1);
    st.sellProceeds = st.sellGross - st.sellFee;
  } else {
    st.sellGross = 0n; st.sellFee = 0n; st.sellProceeds = 0n;
  }
  return st;
}

function renderState() {
  if (!st) return;
  $("state").innerHTML =
    `<b>いまのカーブの中身</b>` +
    `<table><tbody>` +
    `<tr><td>価格</td><td class="r">1 PAT ≈ ${fmt(st.price, 6)} SEI</td></tr>` +
    `<tr><td>購入の停止</td><td class="r">${st.paused ? "すでに止まっています" : "まだ買えます"}</td></tr>` +
    `<tr><td>残っているPAT（在庫）</td><td class="r">${fmt(st.inv, 0)} PAT</td></tr>` +
    `<tr><td>すでに売れたPAT</td><td class="r">${fmt(st.sold, 0)} PAT</td></tr>` +
    `<tr><td>買い戻し用のSEI（直接は引き出せません）</td><td class="r">${fmt(st.backing)} SEI</td></tr>` +
    `<tr><td>手数料のSEI</td><td class="r">${fmt(st.fees)} SEI</td></tr>` +
    `<tr><td>オーナーのSEI残高</td><td class="r">${fmt(st.ownerSei)} SEI</td></tr>` +
    `</tbody></table>` +
    `<p class="small">コントラクト ${CURVE}<br>オーナー ${OWNER}</p>`;
  $("desc2").textContent = `呼び出す関数: withdrawInventory(オーナー, ${fmt(st.inv, 0)} PAT)。`;
  $("desc3").textContent = `呼び出す関数: withdrawFees(オーナー)。いま引き出せる手数料は約 ${fmt(st.fees)} SEI です。買い戻し用の ${fmt(st.backing)} SEI はここでは引き出せません。`;
  $("desc4").textContent = `PATコントラクトで approve(カーブ, ${fmt(st.sold, 0)} PAT) をします。いまの許可は ${fmt(st.allowance, 0)} PAT です。`;
  if (st.sold > 0n) {
    $("desc5").textContent = `呼び出す関数: sell(${fmt(st.sold, 0)} PAT)。受け取るSEIの目安は約 ${fmt(st.sellProceeds)} SEI（手数料 約 ${fmt(st.sellFee)} SEI はカーブに残ります）。`;
  } else {
    $("desc5").textContent = "売れたPATはもうありません。このステップは不要です。";
  }
}

async function simulate(to, data, from) {
  try {
    await rpc("eth_call", [{ from, to, data, value: "0x0" }, "latest"]);
    const gasHex = await rpc("eth_estimateGas", [{ from, to, data, value: "0x0" }]);
    const gas = BigInt(gasHex);
    const gp = BigInt(await rpc("eth_gasPrice", []));
    const fee = gas * gp;
    return { ok: true, gas, gasPrice: gp, fee, error: null };
  } catch (e) {
    const data = e && (e.data || e.message);
    return { ok: false, gas: null, gasPrice: null, fee: null, error: decodeErr(e.message, String(data || e)) };
  }
}

function showSim(id, sim, extraOk, extraNg) {
  const el = $(id);
  if (sim.ok) {
    el.className = "sim ok";
    const sei = Number(sim.fee) / 1e18;
    el.textContent = `事前チェック: 成功しました。ガス代の目安 約 ${sei.toFixed(6)} SEI（${sim.gas.toString()} gas）` + (extraOk ? " " + extraOk : "");
  } else {
    el.className = "sim ng";
    el.textContent = "事前チェック: 失敗しました。" + (sim.error ? "（" + sim.error + "）" : "") + (extraNg ? " " + extraNg : "");
  }
}

function walletReady() {
  return account && account.toLowerCase() === OWNER.toLowerCase() && chainId === CHAIN_ID;
}

async function refreshSims() {
  const from = OWNER;
  const s1 = await simulate(CURVE, dataPause(), from);
  showSim("sim1", s1, st.paused ? "（すでに停止中でも、同じ呼び出しは通ります）" : "");
  $("send1").disabled = !(s1.ok && walletReady());

  if (st.inv > 0n) {
    const s2 = await simulate(CURVE, dataWI(st.inv), from);
    showSim("sim2", s2);
    $("send2").disabled = !(s2.ok && walletReady());
  } else {
    $("sim2").className = "sim ok";
    $("sim2").textContent = "在庫はすでに 0 です。このステップは不要です。";
    $("send2").disabled = true;
  }

  if (st.fees > 0n) {
    const s3 = await simulate(CURVE, dataWF(), from);
    showSim("sim3", s3);
    $("send3").disabled = !(s3.ok && walletReady());
  } else {
    $("sim3").className = "sim ok";
    $("sim3").textContent = "引き出せる手数料はいま 0 です。";
    $("send3").disabled = true;
  }

  if (st.sold > 0n) {
    const needApprove = st.allowance < st.sold;
    if (needApprove) {
      const s4 = await simulate(PAT, dataApprove(st.sold), from);
      showSim("sim4", s4);
      $("send4").disabled = !(s4.ok && walletReady());
    } else {
      $("sim4").className = "sim ok";
      $("sim4").textContent = "許可はすでに足りています。次のステップに進めます。";
      $("send4").disabled = true;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const s5 = await simulate(CURVE, dataSell(st.sold, deadline), from);
    showSim("sim5", s5, needApprove ? "（先に4の許可が必要です。許可後にもう一度お試しください）" : "");
    $("send5").disabled = !(s5.ok && walletReady() && !needApprove);
  } else {
    $("sim4").className = "sim ok"; $("sim4").textContent = "売り戻すPATはありません。このステップは不要です。";
    $("sim5").className = "sim ok"; $("sim5").textContent = "売り戻すPATはありません。このステップは不要です。";
    $("send4").disabled = true; $("send5").disabled = true;
  }

  if (st.inv > 0n && st.sold === 0n) {
    // after sell, inventory may be the returned PAT; step 6 uses live inventory
    const s6 = await simulate(CURVE, dataWI(st.inv), from);
    showSim("sim6", s6, "（第1段階で在庫を戻したあとは、売り戻し後にもう一度出ます）");
    $("send6").disabled = !(s6.ok && walletReady() && st.sold === 0n);
  } else if (st.inv === 0n) {
    $("sim6").className = "sim ok";
    $("sim6").textContent = "引き出す在庫はいま 0 です。売り戻しのあとに、ここにPATが戻ってきます。";
    $("send6").disabled = true;
  } else {
    $("sim6").className = "sim";
    $("sim6").textContent = "第2段階の売り戻しのあとに、戻ったPATをここで引き出します。";
    $("send6").disabled = true;
  }

  if (st.fees > 0n && st.sold === 0n) {
    const s7 = await simulate(CURVE, dataWF(), from);
    showSim("sim7", s7);
    $("send7").disabled = !(s7.ok && walletReady());
  } else if (st.sold === 0n && st.fees === 0n && st.inv === 0n && st.backing === 0n && st.paused) {
    $("sim7").className = "sim ok";
    $("sim7").textContent = "カーブは空で、購入も停止済みです。作業は完了しています。";
    $("send7").disabled = true;
  } else {
    $("sim7").className = "sim";
    $("sim7").textContent = "売り戻しのあとに、残った手数料をここで引き出します。";
    $("send7").disabled = true;
  }
}

async function refresh() {
  ["sim1","sim2","sim3","sim4","sim5","sim6","sim7"].forEach((id) => {
    $(id).className = "sim"; $(id).textContent = "最新の状態を読み込んでいます…";
  });
  ["send1","send2","send3","send4","send5","send6","send7"].forEach((id) => { $(id).disabled = true; });
  try {
    await loadState();
    renderState();
    await refreshSims();
    renderWallet();
  } catch (e) {
    $("state").textContent = "読み込みに失敗しました: " + (e.message || e);
  }
}

function renderWallet() {
  const w = $("wallet");
  if (!window.ethereum) {
    w.textContent = "MetaMask が見つかりません。MetaMask のアプリ内ブラウザで開いてください。";
    return;
  }
  if (!account) { w.textContent = "まだ接続していません。"; return; }
  if (chainId !== CHAIN_ID) {
    w.textContent = `⚠ ネットワークが Sei（1329）ではありません（いまは ${chainId}）。下の「ウォレットを接続する」で切り替えてください。`;
    return;
  }
  if (account.toLowerCase() !== OWNER.toLowerCase()) {
    w.textContent = `⚠ つながっているアカウントが違います（${account}）。オーナーのウォレット ${short(OWNER)} に切り替えてください。`;
    return;
  }
  w.textContent = `接続中: ${short(account)} ／ Sei（1329）。事前チェックが通ったステップだけ署名できます。`;
}

async function ensureChain() {
  const eth = window.ethereum;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if (err && err.code === 4001) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: CHAIN_HEX,
        chainName: "Sei",
        nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 },
        rpcUrls: [RPC],
        blockExplorerUrls: ["https://seiscan.io"],
      }],
    });
  }
  chainId = parseInt(await eth.request({ method: "eth_chainId" }), 16);
}

async function connect() {
  const w = $("wallet");
  const eth = window.ethereum;
  if (!eth) { w.textContent = "MetaMask が見つかりません。MetaMask のアプリ内ブラウザで開いてください。"; return; }
  try {
    const accs = await eth.request({ method: "eth_requestAccounts" });
    account = accs[0];
    await ensureChain();
    renderWallet();
    await refreshSims();
  } catch (e) {
    w.textContent = "接続できませんでした: " + (e && e.message ? e.message.split("\n")[0] : e);
  }
}

async function sendTx(to, data, resId, expectedLabel) {
  const w = $("wallet");
  const eth = window.ethereum;
  if (!eth) { w.textContent = "MetaMask が見つかりません。"; return; }
  try {
    const accs = await eth.request({ method: "eth_requestAccounts" });
    account = accs[0];
    await ensureChain();
    if (chainId !== CHAIN_ID) {
      w.textContent = "⚠ ネットワークが Sei（1329）ではありません。切り替えてからやり直してください。";
      return;
    }
    if (account.toLowerCase() !== OWNER.toLowerCase()) {
      w.textContent = `⚠ つながっているアカウントが違います（${account}）。オーナーのウォレット ${short(OWNER)} に切り替えてください。`;
      return;
    }
    w.textContent = "送る直前にもう一度事前チェックしています…";
    await loadState();
    renderState();
    const sim = await simulate(to, data, OWNER);
    if (!sim.ok) {
      w.textContent = "⚠ 事前チェックが通らないため送りません。" + (sim.error ? "（" + sim.error + "）" : "");
      await refreshSims();
      return;
    }
    const gas = "0x" + ((sim.gas * 13n) / 10n).toString(16);
    w.textContent = `MetaMask で内容を確認して「確認」を押してください。宛先 ${short(to)}、送金額 0 SEI です。`;
    const hash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to, data, value: "0x0", gas }],
    });
    $(resId).innerHTML = `<div class="okbox">送信しました。<br>取引ハッシュ: <code>${hash}</code><br><a href="https://seiscan.io/tx/${hash}" target="_blank" rel="noopener">SeiScan で確認する</a>${expectedLabel ? "<br>" + expectedLabel : ""}</div>`;
    w.textContent = "送信しました。反映を待って、最新の状態を読み直します。";
    await new Promise((r) => setTimeout(r, 4000));
    await refresh();
  } catch (e) {
    w.textContent = "送信されませんでした: " + (e && e.message ? e.message.split("\n")[0] : e);
  }
}

async function onSend(n) {
  await loadState();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
  if (n === 1) return sendTx(CURVE, dataPause(), "res1", "購入が停止されます。売却は開いたままです。");
  if (n === 2) {
    if (st.inv === 0n) { $("wallet").textContent = "在庫はすでに 0 です。"; return; }
    return sendTx(CURVE, dataWI(st.inv), "res2", `${fmt(st.inv, 0)} PAT がオーナーのウォレットに戻ります。`);
  }
  if (n === 3) {
    if (st.fees === 0n) { $("wallet").textContent = "引き出せる手数料はいま 0 です。"; return; }
    return sendTx(CURVE, dataWF(), "res3", `約 ${fmt(st.fees)} SEI の手数料がオーナーに戻ります。`);
  }
  if (n === 4) {
    if (st.sold === 0n) { $("wallet").textContent = "売り戻すPATはありません。"; return; }
    return sendTx(PAT, dataApprove(st.sold), "res4", `${fmt(st.sold, 0)} PAT をカーブに売る許可を出します。`);
  }
  if (n === 5) {
    if (st.sold === 0n) { $("wallet").textContent = "売り戻すPATはありません。"; return; }
    if (st.allowance < st.sold) { $("wallet").textContent = "先に4の許可をしてください。"; return; }
    return sendTx(CURVE, dataSell(st.sold, deadline), "res5", `約 ${fmt(st.sellProceeds)} SEI がオーナーに入り、${fmt(st.sold, 0)} PAT がカーブに戻ります。`);
  }
  if (n === 6) {
    if (st.inv === 0n) { $("wallet").textContent = "引き出す在庫はいま 0 です。"; return; }
    return sendTx(CURVE, dataWI(st.inv), "res6", `${fmt(st.inv, 0)} PAT がオーナーのウォレットに戻ります。`);
  }
  if (n === 7) {
    if (st.fees === 0n) { $("wallet").textContent = "引き出せる手数料はいま 0 です。"; return; }
    return sendTx(CURVE, dataWF(), "res7", `約 ${fmt(st.fees)} SEI の手数料がオーナーに戻ります。`);
  }
}

$("connect").onclick = connect;
$("reload").onclick = refresh;
for (let i = 1; i <= 7; i++) $(("send" + i)).onclick = () => onSend(i);

if (window.ethereum) {
  window.ethereum.on && window.ethereum.on("accountsChanged", (a) => { account = a && a[0] ? a[0] : null; renderWallet(); refreshSims(); });
  window.ethereum.on && window.ethereum.on("chainChanged", () => { window.location.reload(); });
}
refresh();
