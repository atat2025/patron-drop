import type { Metadata } from "next";
import PlansPage from "@/components/Plans";
export const metadata: Metadata = { title: "Put money in · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <PlansPage drop="../" />; }
