import PatronDrop from "@/components/PatronDrop";
import PatCurvePage from "@/components/PatCurve";
/** Mainnet home = Sei PAT buy (PatCurve). Testnet keeps the old Edition 0 page. */
export default function Page() { return process.env.NEXT_PUBLIC_PATRON_NETWORK === "mainnet" ? <PatCurvePage drop="./" /> : <PatronDrop />; }
