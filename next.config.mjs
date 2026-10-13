import { BASE_PATH } from "./src/site.config.mjs";
/** Static export; basePath derived from NEXT_PUBLIC_SITE_URL (see src/site.config.mjs). */
const config = { output: "export", basePath: BASE_PATH, assetPrefix: BASE_PATH || undefined, images: { unoptimized: true }, trailingSlash: true, env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH } };
export default config;
