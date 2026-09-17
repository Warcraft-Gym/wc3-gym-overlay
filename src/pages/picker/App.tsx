import { useEffect, useState } from "react";
import { applyShortcuts, formatCombo } from "../../shortcuts";
import { runSelftest } from "../../selftest";
import type { ShortcutRegistrationResult } from "../../host/bridge";
import { useStoreValue } from "../../store/useStore";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG, SETTINGS, TIMER } from "../../store/keys";

/**
 * Placeholder picker window. F003 replaces this with the real build list +
 * matchup picker; this scaffold proves the shortcut/store wiring works.
 *
 * `applyShortcuts()` unregisters everything before re-registering, so it is
 * safe to call again if this effect ever re-runs (e.g. React StrictMode's
 * dev-mode double-invoke) — no cancellation guard needed.
 */
export function App() {
  const [registrations, setRegistrations] = useState<ShortcutRegistrationResult[]>([]);

  const selectedBuildSlug = useStoreValue(SELECTED_BUILD_SLUG);
  const buildsCache = useStoreValue(BUILDS_CACHE);
  const timer = useStoreValue(TIMER);
  const settings = useStoreValue(SETTINGS);

  useEffect(() => {
    applyShortcuts().then((results) => {
      setRegistrations(results);
      void runSelftest("picker", results);
    });
  }, []);

  const snapshot = { selectedBuildSlug, buildsCache, timer, settings };

  return (
    <main>
      <h1>Warcraft 3 Gym — Build picker</h1>
      <h2>Shortcuts</h2>
      <ul>
        {registrations.map((r) => (
          <li key={r.action}>
            {r.action}: {formatCombo(r.combo)} — {r.registered ? "registered" : `failed${r.error ? ` (${r.error})` : ""}`}
          </li>
        ))}
      </ul>
      <h2>Store snapshot</h2>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </main>
  );
}
