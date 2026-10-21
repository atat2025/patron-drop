import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";

const dm = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm" });
import { SITE_URL } from "../site.config.mjs";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL + "/"),
  alternates: { canonical: "./" },
  title: "PATRON",
  description: "PATRON: buy, sell and redeem the limited $PATRON mustache token on Sei.",
  openGraph: { title: "PATRON", description: "PATRON · limited $PATRON mustache token on Sei.", type: "website", url: "./", images: [{ url: "og.png", width: 1200, height: 630, alt: "PATRON" }] },
  twitter: { card: "summary_large_image", title: "PATRON", images: ["og.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" translate="no" className={`${dm.variable} notranslate`}><head><meta name="google" content="notranslate" /></head><body>{children}<SiteFooter /></body></html>;
}
