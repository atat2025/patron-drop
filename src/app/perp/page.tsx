import type { Metadata } from "next";
import PerpTerminal from "@/components/PerpTerminal";
export const metadata: Metadata = { title: "PERP · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <PerpTerminal />; }
