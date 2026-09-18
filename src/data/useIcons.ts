/**
 * Fetches the site's WC3 icon manifest once per `apiBase`, caching it in
 * `wc3gym.iconsCache` (`ICONS_CACHE`) so the editor's icon picker opens
 * instantly on every later launch — same "cache, don't block" shape as
 * `useBuilds`. The manifest never blocks editing: a build that already
 * carries icon keys (from before the manifest loaded, or while offline)
 * keeps working via `deriveFallbackIcons`, whether or not the real
 * manifest ever arrives.
 */

import { useEffect, useState } from "react";
import { fetchIcons } from "../api/client";
import type { GameIconEntry } from "../api/schema";
import type { AnyBuild } from "./useAllBuilds";
import { ICONS_CACHE } from "../store/keys";
import { readKey, writeKey } from "../store/state";
import { useStoreValue } from "../store/useStore";

export type UseIconsStatus = "loading" | "ready" | "offline";

export type UseIconsResult = {
  icons: GameIconEntry[];
  status: UseIconsStatus;
};

/** Minimal icon entries derived from whatever icon keys are already used by
 *  `builds`' steps — enough for the icon picker to show *something*
 *  (title falls back to the raw key) when the real manifest never loaded.
 *  Deduped by key. */
export function deriveFallbackIcons(builds: AnyBuild[], apiBase: string): GameIconEntry[] {
  const seen = new Map<string, GameIconEntry>();
  for (const build of builds) {
    for (const step of build.steps) {
      if (!step.icon || seen.has(step.icon)) continue;
      seen.set(step.icon, {
        key: step.icon,
        title: step.icon,
        race: "neutral",
        kind: "misc",
        url: step.iconUrl ?? `${apiBase}/wc3-icons/${step.icon}.webp`,
      });
    }
  }
  return [...seen.values()];
}

export function useIcons(apiBase: string, fallbackBuilds: AnyBuild[] = []): UseIconsResult {
  const cache = useStoreValue(ICONS_CACHE);
  const cacheIsCurrent = cache.apiBase === apiBase && cache.icons.length > 0;
  const [status, setStatus] = useState<UseIconsStatus>(cacheIsCurrent ? "ready" : "loading");

  useEffect(() => {
    let cancelled = false;
    setStatus(readKey(ICONS_CACHE).apiBase === apiBase && readKey(ICONS_CACHE).icons.length > 0 ? "ready" : "loading");

    fetchIcons(apiBase).then(
      (icons) => {
        if (cancelled) return;
        void writeKey(ICONS_CACHE, { fetchedAt: new Date().toISOString(), apiBase, icons });
        setStatus("ready");
      },
      (err: unknown) => {
        if (cancelled) return;
        console.warn("[wc3gym] failed to load icon manifest", err);
        setStatus(readKey(ICONS_CACHE).apiBase === apiBase && readKey(ICONS_CACHE).icons.length > 0 ? "ready" : "offline");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  if (cacheIsCurrent) {
    return { icons: cache.icons, status };
  }
  return { icons: deriveFallbackIcons(fallbackBuilds, apiBase), status };
}
