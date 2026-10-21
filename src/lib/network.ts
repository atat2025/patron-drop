/** ONE switch for the whole site: NEXT_PUBLIC_PATRON_NETWORK = "testnet" (default) | "mainnet".
 *  To go live later, fill the mainnet block below (or set the NEXT_PUBLIC_* overrides) and rebuild.
 *  Any address left empty turns that feature off instead of pointing at the wrong chain. */
export type NetName = "testnet" | "mainnet";
export interface NetConfig {
  name: NetName; label: string; chainId: number; chainName: string; rpc: string;
  explorer: string; explorerChain: string; seiscan: string;
  market: string; token: string; marketFromBlock: bigint;
  vaults: { id: string; address: string }[];
  dataUrl: string; // keeper/indexer output (market fills + keeper log)
  faucet?: string;
}

const NETS: Record<NetName, NetConfig> = {
  testnet: {
    name: "testnet", label: "TESTNET", chainId: 1328, chainName: "Sei Testnet (atlantic-2)",
    rpc: "https://evm-rpc-testnet.sei-apis.com", explorer: "https://seitrace.com", explorerChain: "atlantic-2", seiscan: "https://testnet.seiscan.io",
    market: "0xB4Bf3BbA6BD96D8C1736940c75d85E4EA4b02039", token: "0x322d1A62ca7505827baedC726949168Ff06b106f", marketFromBlock: 276662707n,
    vaults: [
      { id: "momentum", address: "0x45B489073D3d72A4A578050e018eeBb92A341aD4" },
      { id: "meanrev", address: "0xA26B71ac46d2aeD2669CDc3cb2ae1B229a8b91b9" },
      { id: "dca", address: "0x3d5bC998489154F3ed1EF33466EBf944f22a7f61" },
    ],
    dataUrl: "https://raw.githubusercontent.com/atat2025/patron-drop/data",
    faucet: "https://docs.sei.io/learn/faucet",
  },
  mainnet: {
    name: "mainnet", label: "MAINNET", chainId: 1329, chainName: "Sei",
    rpc: "https://evm-rpc.sei-apis.com", explorer: "https://seitrace.com", explorerChain: "pacific-1", seiscan: "https://seiscan.io",
    // Filled after `forge script script/DeployMainnetDrop.s.sol` (patron-perp/contracts). Empty = feature off.
    market: "0x9d65dCb24B55f5227E7AdA81bdEf80a54570623b", // PatronMarket (Edition 0 curve)
    token: "0xc5D5D8a32AD707A10e340a666822BB615a220a75", // PATRON Edition 0 token minted by the market
    marketFromBlock: 238880090n, // deploy block (chart index start)
    vaults: [
      { id: "momentum", address: "0x085a614F85283F284699ae78eD963f777c7617A6" },
      { id: "meanrev", address: "0xa2273EbB4B594fEE90e0A0172e2dA3Ad73b6a974" },
      { id: "dca", address: "0xe692187a6b015f56Fc44F05530Afb5d6964124E0" },
    ].filter((v) => v.address),
    dataUrl: "", // e.g. https://raw.githubusercontent.com/atat2025/patron-drop/data-mainnet (keeper output)
  },
};

const pick: NetName = process.env.NEXT_PUBLIC_PATRON_NETWORK === "mainnet" ? "mainnet" : "testnet";
const base = NETS[pick];
export const NET: NetConfig = {
  ...base,
  market: process.env.NEXT_PUBLIC_PATRON_MARKET ?? base.market,
  token: process.env.NEXT_PUBLIC_PATRON_TOKEN ?? base.token,
  rpc: process.env.NEXT_PUBLIC_PATRON_RPC_URL || base.rpc,
  marketFromBlock: BigInt(process.env.NEXT_PUBLIC_PATRON_MARKET_BLOCK || base.marketFromBlock.toString()),
  dataUrl: process.env.NEXT_PUBLIC_PATRON_DATA_URL ?? base.dataUrl,
  vaults: process.env.NEXT_PUBLIC_PATRON_VAULTS ? JSON.parse(process.env.NEXT_PUBLIC_PATRON_VAULTS) : base.vaults,
};
export const isTestnet = NET.name === "testnet";
export const explorerTx = (h: string) => `${NET.explorer}/tx/${h}?chain=${NET.explorerChain}`;
export const explorerAddr = (a: string) => `${NET.explorer}/address/${a}?chain=${NET.explorerChain}`;
export const seiscanTx = (h: string) => `${NET.seiscan}/tx/${h}`;
