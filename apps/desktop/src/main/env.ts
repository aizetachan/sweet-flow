import { APP_ORIGIN } from "./appProtocol";

/** Where the renderer comes from: the Vite dev server (dev) or the bundled build. */

/** Set by scripts/dev.mjs; when absent the bundled renderer is loaded. */
export const DEV_URL = process.env.SWEETFLOW_RENDERER_URL;

/** True for URLs that belong to our own renderer. */
export function isAppUrl(url: string): boolean {
  if (DEV_URL) return url.startsWith(DEV_URL);
  return url.startsWith(`${APP_ORIGIN}/`);
}
