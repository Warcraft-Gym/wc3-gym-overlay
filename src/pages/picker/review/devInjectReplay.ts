/**
 * F010 (review-ui) - dev-only convenience for trying the review pipeline in
 * `pnpm dev` without actually playing a game: `?injectReplay=<url>` fetches
 * a `.w3g` from the dev server and injects it through the exact same path a
 * real pickup would use (`injectLastReplayForTest`, `host/browser.ts`).
 *
 * Gated on `import.meta.env.DEV`, which Vite replaces with the literal
 * `false` in a production build - the dead branch below (including the
 * `"injectReplay"` query-param name itself) is stripped from `dist` by the
 * production build's minifier, not just left unreachable at runtime. See
 * this feature's build gate (`pnpm build` + grepping `dist` for the param
 * name).
 */

import { injectLastReplayForTest } from "../../../host/browser";

export function installDevInjectReplay(): void {
  if (!import.meta.env.DEV) return;

  const url = new URLSearchParams(location.search).get("injectReplay");
  if (!url) return;

  fetch(url)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      injectLastReplayForTest({ path: url, mtimeMs: Date.now(), bytes: new Uint8Array(buffer) });
    })
    .catch((err: unknown) => {
      console.warn("[wc3gym] ?injectReplay fetch failed", err);
    });
}
