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
 *
 * F010a - follow-up of F010: `ReviewLauncher` calls this from a plain
 * `useEffect(() => installDevInjectReplay(), [])`, which React's
 * `<StrictMode>` (`pages/picker/main.tsx`) mounts twice in dev - without a
 * guard, that fired the `fetch` (and the resulting `injectLastReplayForTest`
 * call) twice for one `?injectReplay=` page load, and the review pipeline's
 * own "newest replay wins" in-flight tracking (`reviews/pipeline.ts`) then
 * aborted the first import and kept only the second - a visible aborted
 * POST immediately followed by a successful one, for what should have been
 * a single request. `alreadyInjected` makes every call after the first one
 * on a given page load a no-op, so exactly one `fetch`/inject happens no
 * matter how many times StrictMode (or anything else) calls this function.
 */

import { injectLastReplayForTest } from "../../../host/browser";

let alreadyInjected = false;

export function installDevInjectReplay(): void {
  if (!import.meta.env.DEV) return;
  if (alreadyInjected) return;

  const url = new URLSearchParams(location.search).get("injectReplay");
  if (!url) return;

  alreadyInjected = true;

  fetch(url)
    .then((response) => response.arrayBuffer())
    .then((buffer) => {
      injectLastReplayForTest({ path: url, mtimeMs: Date.now(), bytes: new Uint8Array(buffer) });
    })
    .catch((err: unknown) => {
      console.warn("[wc3gym] ?injectReplay fetch failed", err);
    });
}
