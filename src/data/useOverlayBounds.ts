import { useEffect, useRef } from "react";
import { host } from "../host";
import { SETTINGS } from "../store/keys";
import { readKey, updateKey } from "../store/state";

const PERSIST_DEBOUNCE_MS = 400;

/**
 * Restores the overlay window's last saved position/size on mount, then
 * persists it (debounced) whenever the window moves or is resized. A no-op
 * in the browser host — `host.getWindowBounds`/`setWindowBounds` are no-ops
 * there and `onWindowBoundsChanged` never fires.
 */
export function useOverlayBounds(): void {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const savedBounds = readKey(SETTINGS).overlayBounds;
    if (savedBounds) void host.setWindowBounds(savedBounds);

    function persistBounds(): void {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void host.getWindowBounds().then((bounds) => {
          if (!bounds) return;
          void updateKey(SETTINGS, (settings) => ({ ...settings, overlayBounds: bounds }));
        });
      }, PERSIST_DEBOUNCE_MS);
    }

    const unsubscribe = host.onWindowBoundsChanged(persistBounds);
    return () => {
      unsubscribe();
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);
}
