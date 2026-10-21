import type { Metadata } from "next";
import PlansPage from "@/components/Plans";
export const metadata: Metadata = { title: "Let it trade for you (preview) · PATRON", robots: { index: false, follow: false } };
export default function Page() { return <PlansPage drop="../../" />; }
