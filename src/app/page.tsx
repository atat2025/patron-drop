import PatronDrop from "@/components/PatronDrop";
import PatHome from "@/components/PatHome";
/** Mainnet home = original layout on Sei mainnet PatCurve. Testnet keeps the old page. */
export default function Page() { return process.env.NEXT_PUBLIC_PATRON_NETWORK === "mainnet" ? <PatHome /> : <PatronDrop />; }
