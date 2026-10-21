import type { Metadata } from "next";
import BridgePage from "@/components/Bridge";
export const metadata: Metadata = { title: "Bridge PAT · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <BridgePage drop="../" />; }
