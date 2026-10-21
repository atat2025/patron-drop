import type { Metadata } from "next";
import Exchange from "@/components/Exchange";
export const metadata: Metadata = { title: "PERP · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <Exchange perpOnly />; }
