/**
 * Fetches the published build list on mount and whenever `settings.apiBase`
 * changes, keeping an offline cache in the store so the picker never blanks:
 * a failed fetch falls back to whatever was last cached, and only reports
 * "empty" when there is truly nothing to show.
 */

import { useEffect, useState } from "react";
import { ApiError, fetchBuilds } from "../api/client";
import type { ApiBuildListItem } from "../api/schema";
import { BUILDS_CACHE, SETTINGS } from "../store/keys";
import { readKey, writeKey } from "../store/state";
import { useStoreValue } from "../store/useStore";

export type BuildsStatus = "loading" | "ready" | "offline" | "empty";

export type UseBuildsResult = {
  status: BuildsStatus;
  builds: ApiBuildListItem[];
  fetchedAt: string;
  error: ApiError | null;
  retry: () => void;
};

export function useBuilds(): UseBuildsResult {
  const settings = useStoreValue(SETTINGS);
  const cache = useStoreValue(BUILDS_CACHE);
  const [status, setStatus] = useState<BuildsStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    fetchBuilds(settings.apiBase).then(
      (builds) => {
        if (cancelled) return;
        void writeKey(BUILDS_CACHE, {
          fetchedAt: new Date().toISOString(),
          apiBase: settings.apiBase,
          builds,
        });
        setError(null);
        setStatus(builds.length === 0 ? "empty" : "ready");
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError("network", String(err)));
        setStatus(readKey(BUILDS_CACHE).builds.length > 0 ? "offline" : "empty");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [settings.apiBase, attempt]);

  return {
    status,
    builds: cache.builds,
    fetchedAt: cache.fetchedAt,
    error,
    retry: () => setAttempt((n) => n + 1),
  };
}
