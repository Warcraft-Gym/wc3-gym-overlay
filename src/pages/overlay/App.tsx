import { useStoreValue } from "../../store/useStore";
import { BUILDS_CACHE, SELECTED_BUILD_SLUG, SETTINGS, TIMER } from "../../store/keys";
import { elapsedMs, formatClock } from "../../store/timer";

/**
 * Placeholder overlay window. F004 replaces this with the real build-order
 * panel; this scaffold proves the transparent, draggable, always-on-top
 * window plus the shared clock/store wiring works.
 */
export function App() {
  const selectedBuildSlug = useStoreValue(SELECTED_BUILD_SLUG);
  const buildsCache = useStoreValue(BUILDS_CACHE);
  const timer = useStoreValue(TIMER);
  const settings = useStoreValue(SETTINGS);

  const elapsedSeconds = elapsedMs(timer, Date.now()) / 1000;
  const snapshot = { selectedBuildSlug, buildsCache, timer, settings };

  return (
    <div data-overlay-root>
      <header data-tauri-drag-region>Overlay</header>
      <div>{formatClock(elapsedSeconds)}</div>
      <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    </div>
  );
}
