/** ONE value controls the public URL: NEXT_PUBLIC_SITE_URL (origin + optional sub-path).
 *  basePath, OG/canonical URLs are all derived from it. Swap in the real domain later. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://atat2025.github.io/patron-drop").replace(/\/$/, "");
export const BASE_PATH = new URL(SITE_URL).pathname.replace(/\/$/, "");
