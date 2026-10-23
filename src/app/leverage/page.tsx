import type { Metadata } from "next";
import Leverage from "@/components/Leverage";
export const metadata: Metadata = { title: "SEI 3x Leverage (Testnet demo) · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <Leverage />; }
