import type { Network } from "@0xmonaco/types";

export const config = {
  network: (process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") as Network,
  seiRpcUrl: process.env.NEXT_PUBLIC_SEI_RPC_URL || "https://evm-rpc-testnet.sei-apis.com",
  // Default: Monaco public testnet clientId (docs.0xmonaco.com). Public value, not a secret.
  clientId: process.env.NEXT_PUBLIC_MONACO_CLIENT_ID || ((process.env.NEXT_PUBLIC_MONACO_NETWORK || "staging") === "staging" ? "688a21440e304c06b935f743dae88278" : ""),
  builderFeeBps: Number(process.env.NEXT_PUBLIC_BUILDER_FEE_BPS || "0"),
  builderPayoutAddress: process.env.NEXT_PUBLIC_BUILDER_PAYOUT_ADDRESS || "",
  forceMock: process.env.NEXT_PUBLIC_USE_MOCK === "true",
};
