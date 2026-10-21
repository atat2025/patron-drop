import type { Metadata } from "next";
import PlansPage from "@/components/PlansClassic";
export const metadata: Metadata = { title: "Automated trading · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <PlansPage drop="../" />; }
