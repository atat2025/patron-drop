import type { Metadata } from "next";
import MarketsPage from "@/components/MarketsPage";
export const metadata: Metadata = { title: "Markets · PATRON", description: "Asset classes on PATRON: Human, Equities and Digital Assets.", alternates: { canonical: "./" } };
export default function Page() { return <MarketsPage />; }
