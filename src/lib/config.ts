import type { Network } from "@0xmonaco/types";

export const config = {
  network: (process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") as Network,
  seiRpcUrl: process.env.NEXT_PUBLIC_SEI_RPC_URL || "https://evm-rpc-testnet.sei-apis.com",
  // Default: Monaco public testnet clientId (docs.0xmonaco.com). Public value, not a secret.
  clientId: process.env.NEXT_PUBLIC_MONACO_CLIENT_ID || ((process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") === "staging" ? "688a21440e304c06b935f743dae88278" : ""),
  // SDK's built-in mainnet URL (api.monaco.xyz) does not resolve; the live mainnet API is apimonaco.xyz.
  apiUrl: process.env.NEXT_PUBLIC_MONACO_API_URL || ((process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") === "mainnet" ? "https://apimonaco.xyz" : undefined),
  wsUrl: process.env.NEXT_PUBLIC_MONACO_WS_URL || ((process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") === "mainnet" ? "wss://ws.apimonaco.xyz/ws" : undefined),
  builderFeeBps: Number(process.env.NEXT_PUBLIC_BUILDER_FEE_BPS || "0"),
  builderPayoutAddress: process.env.NEXT_PUBLIC_BUILDER_PAYOUT_ADDRESS || "",
  forceMock: process.env.NEXT_PUBLIC_USE_MOCK === "true",
};
