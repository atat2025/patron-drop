/**
 * Card / Apple Pay purchase of PATRON via Transak (STAGING).
 * !!! PLACEHOLDER: replace NEXT_PUBLIC_TRANSAK_API_KEY with the key from the Transak partner dashboard (after KYB).
 * The Transak *API key* is a public, client-side identifier; never put the Transak *secret* here or in git.
 */
export const CARD = {
  transakEnv: process.env.NEXT_PUBLIC_TRANSAK_ENV || "STAGING",
  transakApiKey: process.env.NEXT_PUBLIC_TRANSAK_API_KEY || "REPLACE_WITH_TRANSAK_STAGING_API_KEY",
  get transakBase() { return this.transakEnv === "PRODUCTION" ? "https://global.transak.com" : "https://global-stg.transak.com"; },
  /** Estimate only. Transak quotes the real price/fee inside its widget. */
  feePct: Number(process.env.NEXT_PUBLIC_TRANSAK_FEE_PCT || "5.5"),
  feeFixedUsd: Number(process.env.NEXT_PUBLIC_TRANSAK_FEE_FIXED_USD || "1"),
  seiUsd: Number(process.env.NEXT_PUBLIC_SEI_USD || "0.30"), // placeholder FX for the estimate
  gasBufferSei: Number(process.env.NEXT_PUBLIC_GAS_BUFFER_SEI || "0.05"),
  minUsd: Number(process.env.NEXT_PUBLIC_TRANSAK_MIN_USD || "30"),
};
export const isPlaceholderKey = () => CARD.transakApiKey.startsWith("REPLACE_");
export function transakUrl(wallet: string, fiatUsd: number) {
  const p = new URLSearchParams({
    apiKey: CARD.transakApiKey, network: "sei", cryptoCurrencyCode: "SEI", walletAddress: wallet,
    disableWalletAddressForm: "true", fiatCurrency: "USD", fiatAmount: String(Math.ceil(fiatUsd)),
    productsAvailed: "BUY", themeColor: "ff0047",
  });
  return `${CARD.transakBase}/?${p}`;
}
