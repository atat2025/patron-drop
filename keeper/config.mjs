// Shared addresses for the keeper/indexer. KEEPER_NET=mainnet selects Sei mainnet (1329); default is TESTNET (1328).
const MAIN = process.env.KEEPER_NET === "mainnet";
export const NET_NAME = MAIN ? "mainnet" : "testnet";
export const CHAIN_ID = MAIN ? 1329 : 1328;
export const RPC = MAIN ? "https://evm-rpc.sei-apis.com" : "https://evm-rpc-testnet.sei-apis.com";
export const MARKET = MAIN ? "0x9d65dCb24B55f5227E7AdA81bdEf80a54570623b" : "0xB4Bf3BbA6BD96D8C1736940c75d85E4EA4b02039";
export const TOKEN = MAIN ? "0xc5D5D8a32AD707A10e340a666822BB615a220a75" : "0x322d1A62ca7505827baedC726949168Ff06b106f";
export const MARKET_FROM = MAIN ? 238880090n : 276662707n; // PatronMarket deploy block
export const VAULTS = MAIN ? [
  { id: "momentum", address: "0x085a614F85283F284699ae78eD963f777c7617A6" },
  { id: "meanrev", address: "0xa2273EbB4B594fEE90e0A0172e2dA3Ad73b6a974" },
  { id: "dca", address: "0xe692187a6b015f56Fc44F05530Afb5d6964124E0" },
] : [
  { id: "momentum", address: "0x45B489073D3d72A4A578050e018eeBb92A341aD4" },
  { id: "meanrev", address: "0xA26B71ac46d2aeD2669CDc3cb2ae1B229a8b91b9" },
  { id: "dca", address: "0x3d5bC998489154F3ed1EF33466EBf944f22a7f61" },
];
