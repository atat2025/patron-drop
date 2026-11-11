import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import SiteFooter from "@/components/SiteFooter";
import SiteNav from "@/components/SiteNav";

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
  return <html suppressHydrationWarning lang="en" translate="no" className={`${dm.variable} notranslate`}><head><meta name="google" content="notranslate" /><script dangerouslySetInnerHTML={{ __html: `(function(){function resolve(){var q=location.search.match(/[?&]theme=(dark|light)/);try{if(resolve.boot==null&&q)localStorage.setItem("patron-theme",q[1]);resolve.boot=1;return localStorage.getItem("patron-theme")==="light"?"light":"dark"}catch(e){if(resolve.boot==null){resolve.boot=1;resolve.mem=q&&q[1]==="light"?"light":"dark"}return resolve.mem||"dark"}}function apply(){var t=resolve(),el=document.documentElement;if(t==="dark"){if(el.getAttribute("data-theme")!=="dark")el.setAttribute("data-theme","dark")}else if(el.hasAttribute("data-theme"))el.removeAttribute("data-theme")}window.__patronApplyTheme=apply;apply();new MutationObserver(apply).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]})})();` }} /></head><body><SiteNav />{children}<SiteFooter /></body></html>;
}
