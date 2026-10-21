import type { Metadata } from "next";
import PoolAdmin from "@/components/PoolAdmin";
export const metadata: Metadata = { title: "売り場の準備 · PATRON", robots: { index: false, follow: false } };
export default function Page() { return <PoolAdmin />; }
