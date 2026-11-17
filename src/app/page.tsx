import type { Metadata } from "next";
import RhBuyPage from "@/components/RhBuy";

export const metadata: Metadata = { title: "Buy PAT on Robinhood Chain · PATRON", alternates: { canonical: "./" } };

/** Home is the Robinhood Chain PAT buy page (ETH -> NVDA -> PAT, Uniswap PAT/NVDA pool). Sei buy page stays at /pat/. */
export default function Page() {
  return <RhBuyPage drop="/" />;
}
