/** Chain switcher config for the plans page. Add a chain by filling its block and setting enabled: true.
 *  Every plan defaults to a 20% share of profit (owner can set 10%-30% per plan on-chain, hard cap 30%). */
export type PlanId = "pat" | "usdc" | "sei";
export interface PlanCfg { id: PlanId; address: `0x${string}`; asset: string; decimals: number; token?: `0x${string}`; title: string; blurb: string; minIn: string }
export interface ChainCfg { key: string; name: string; enabled: boolean; chainId: number; rpc: string; explorer: string; native: string; plans: PlanCfg[] }
export const DEFAULT_FEE_BPS = 2000;

export const CHAINS: ChainCfg[] = [
  {
    key: "sei", name: "Sei", enabled: true, chainId: 1329, rpc: "https://evm-rpc.sei-apis.com", explorer: "https://seiscan.io", native: "SEI",
    plans: [
      { id: "pat", address: "0xb243ccdb1a260f593915d9d767a0d4022d1a3453", asset: "PATRON", decimals: 18, token: "0x3d9C71B7f7907e842a3Bbf7e07d9954fB6a44e95", title: "Put in PATRON", blurb: "Keep your PATRON. When its price goes up, we sell a little and keep the gain as USDC.", minIn: "1" },
      { id: "usdc", address: "0x2f3f05828572394aace80d9661bc665b071f78a8", asset: "USDC", decimals: 6, token: "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392", title: "Put in USDC", blurb: "Your dollars stay mostly in USDC. When SEI is cheap we buy a little, and sell it when it goes up.", minIn: "0.1" },
      { id: "sei", address: "0x757afab1d28506d46ca5c4caed2e81f20a6c98fd", asset: "SEI", decimals: 18, title: "Put in SEI", blurb: "Keep your SEI. When SEI goes up, we put a little into USDC, and buy back when it drops.", minIn: "0.01" },
    ],
  },
  { key: "hyperliquid", name: "Hyperliquid", enabled: false, chainId: 999, rpc: "https://rpc.hyperliquid.xyz/evm", explorer: "https://hyperevmscan.io", native: "HYPE", plans: [] },
  { key: "bnb", name: "BNB Chain", enabled: false, chainId: 56, rpc: "https://bsc-dataseed.bnbchain.org", explorer: "https://bscscan.com", native: "BNB", plans: [] },
  { key: "ethereum", name: "Ethereum", enabled: false, chainId: 1, rpc: "https://ethereum-rpc.publicnode.com", explorer: "https://etherscan.io", native: "ETH", plans: [] },
];
