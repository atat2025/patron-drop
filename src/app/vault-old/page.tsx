import type { Metadata } from "next";
import VaultPage from "@/components/Vault";
export const metadata: Metadata = { title: "Old vaults (Edition 0) · PATRON", robots: { index: false, follow: false }, alternates: { canonical: "./" } };
export default function Page() { return <VaultPage home={process.env.NEXT_PUBLIC_HOME_URL || "https://patron.red"} drop="../" />; }
