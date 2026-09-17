import { SETTINGS } from "../../store/keys";
import { updateKey } from "../../store/state";

/**
 * Reads `?api=<url>` from `search` and writes it into `SETTINGS.apiBase`
 * once, when it parses as a valid URL — a dev/QA convenience so the overlay
 * can point at a local site without opening the settings drawer first.
 *
 * Called from `main.tsx` *before* React mounts, not from a `useEffect`: the
 * first render's `useBuilds()` snapshot is taken during render, before any
 * effect commits, so an effect-based override always loses a fetch to the
 * stale default `apiBase` first. Hydrating the store before `createRoot`
 * ever renders means the first render already sees the override.
 */
export function applyApiBaseOverride(search: string): void {
  const raw = new URLSearchParams(search).get("api");
  if (!raw) return;
  try {
    const url = new URL(raw);
    void updateKey(SETTINGS, (s) => ({ ...s, apiBase: url.toString().replace(/\/$/, "") }));
  } catch {
    console.warn(`[wc3gym] ignoring invalid ?api= override: ${raw}`);
  }
}
