import { createPublicClient, createWalletClient, custom, defineChain, http, parseAbi, padHex, type Address, type EIP1193Provider } from "viem";

/** PATRON (PAT) LayerZero V2 bridge: Robinhood Chain OFTAdapter <-> Sei OFT (same address on both). MAINNET. */
export const BRIDGE = "0x3d9C71B7f7907e842a3Bbf7e07d9954fB6a44e95" as Address;
export const PAT_RH = "0x44CF4cA3D50B2EE4fB614C7B27f7e5fB72baeaf3" as Address;

export const robinhood = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } }, blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } } });
export const sei = defineChain({ id: 1329, name: "Sei", nativeCurrency: { name: "SEI", symbol: "SEI", decimals: 18 }, rpcUrls: { default: { http: ["https://evm-rpc.sei-apis.com"] } }, blockExplorers: { default: { name: "Seiscan", url: "https://seiscan.io" } } });

export type Side = "rh" | "sei";
export const SIDES = {
  rh: { chain: robinhood, eid: 30416, token: PAT_RH, label: "Robinhood Chain", gas: "ETH", needsApprove: true },
  sei: { chain: sei, eid: 30280, token: BRIDGE, label: "Sei", gas: "SEI", needsApprove: false },
} as const;
export const other = (s: Side): Side => (s === "rh" ? "sei" : "rh");

const oftAbi = parseAbi([
  "struct SendParam { uint32 dstEid; bytes32 to; uint256 amountLD; uint256 minAmountLD; bytes extraOptions; bytes composeMsg; bytes oftCmd; }",
  "struct MessagingFee { uint256 nativeFee; uint256 lzTokenFee; }",
  "function quoteSend(SendParam _sendParam, bool _payInLzToken) view returns (MessagingFee)",
  "function send(SendParam _sendParam, MessagingFee _fee, address _refundAddress) payable returns ((bytes32 guid, uint64 nonce, MessagingFee fee), (uint256 amountSentLD, uint256 amountReceivedLD))",
]);
const erc20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);

export const pub = { rh: createPublicClient({ chain: robinhood, transport: http() }), sei: createPublicClient({ chain: sei, transport: http() }) };

/** OFT shared decimals = 6, so amounts are rounded down to 1e12 wei (dust). */
export const dust = (v: bigint) => v - (v % 10n ** 12n);

export function sendParam(src: Side, to: Address, amount: bigint) {
  const a = dust(amount);
  // extraOptions empty: the enforced options set on both contracts (lzReceive 80,000 gas) are applied automatically.
  return { dstEid: SIDES[other(src)].eid, to: padHex(to, { size: 32 }), amountLD: a, minAmountLD: a, extraOptions: "0x" as `0x${string}`, composeMsg: "0x" as `0x${string}`, oftCmd: "0x" as `0x${string}` };
}
export const balance = (s: Side, a: Address) => pub[s].readContract({ address: SIDES[s].token, abi: erc20, functionName: "balanceOf", args: [a] });
export const gasBalance = (s: Side, a: Address) => pub[s].getBalance({ address: a });
export const quote = (s: Side, to: Address, amount: bigint) => pub[s].readContract({ address: BRIDGE, abi: oftAbi, functionName: "quoteSend", args: [sendParam(s, to, amount), false] });

const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: EIP1193Provider }).ethereum : undefined);
export const hasWallet = () => Boolean(eth());
export async function connect(): Promise<Address> {
  const e = eth(); if (!e) throw new Error("No wallet found. Open this page in your wallet app's browser (MetaMask, Trust, Rabby…).");
  const [a] = (await e.request({ method: "eth_requestAccounts" })) as Address[];
  return a;
}
export async function switchTo(s: Side) {
  const e = eth()!; const c = SIDES[s].chain; const hex = ("0x" + c.id.toString(16)) as `0x${string}`;
  if (Number(await e.request({ method: "eth_chainId" })) === c.id) return;
  try { await e.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] }); }
  catch {
    await e.request({ method: "wallet_addEthereumChain", params: [{ chainId: hex, chainName: c.name, nativeCurrency: c.nativeCurrency, rpcUrls: [...c.rpcUrls.default.http], blockExplorerUrls: [c.blockExplorers.default.url] }] });
  }
}
async function walletFor(s: Side) {
  const e = eth(); if (!e) throw new Error("No wallet found");
  const account = await connect(); await switchTo(s);
  return createWalletClient({ account, chain: SIDES[s].chain, transport: custom(e) });
}
export async function needsApproval(s: Side, owner: Address, amount: bigint) {
  if (!SIDES[s].needsApprove) return false;
  return (await pub[s].readContract({ address: SIDES[s].token, abi: erc20, functionName: "allowance", args: [owner, BRIDGE] })) < dust(amount);
}
export async function approve(s: Side, amount: bigint) {
  const w = await walletFor(s);
  const hash = await w.writeContract({ address: SIDES[s].token, abi: erc20, functionName: "approve", args: [BRIDGE, dust(amount)], account: w.account!, chain: SIDES[s].chain });
  const r = await pub[s].waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("Approve failed");
  return hash;
}
export async function bridge(s: Side, to: Address, amount: bigint) {
  const w = await walletFor(s); const me = w.account!.address;
  const fee = await quote(s, to, amount);
  const hash = await w.writeContract({ address: BRIDGE, abi: oftAbi, functionName: "send", args: [sendParam(s, to, amount), fee, me], value: fee.nativeFee, account: w.account!, chain: SIDES[s].chain });
  const r = await pub[s].waitForTransactionReceipt({ hash }); if (r.status !== "success") throw new Error("Bridge transaction reverted");
  return hash;
}
export const txUrl = (s: Side, h: string) => `${SIDES[s].chain.blockExplorers.default.url}/tx/${h}`;
export const lzUrl = (h: string) => `https://layerzeroscan.com/tx/${h}`;
