import type { Metadata } from "next";
import VaultPage from "@/components/Vault";
export const metadata: Metadata = { title: "PATRON Vault", alternates: { canonical: "./" } };
export default function Page() { return <VaultPage home={process.env.NEXT_PUBLIC_HOME_URL || "https://patron.red"} drop="../" />; }
