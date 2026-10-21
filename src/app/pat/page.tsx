import type { Metadata } from "next";
import PatCurvePage from "@/components/PatCurve";
export const metadata: Metadata = { title: "Buy PAT on Sei · PATRON", alternates: { canonical: "./" } };
export default function Page() { return <PatCurvePage drop="../" />; }
