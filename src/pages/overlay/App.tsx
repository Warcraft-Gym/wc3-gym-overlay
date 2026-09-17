import { useEffect } from "react";
import { useOverlayBounds } from "../../data/useOverlayBounds";
import { host } from "../../host";
import { applyShortcuts } from "../../shortcuts";
import { OverlayPanel } from "./OverlayPanel";
import "./overlay.css";

/**
 * The real in-game build-order panel: a transparent, draggable,
 * always-on-top window driven by the shared store, the header buttons and
 * the global shortcuts.
 *
 * In Tauri, only the picker window registers global shortcuts (they're
 * app-wide OS registrations); this window just re-renders when the store
 * changes. In a plain browser tab there is no OS-level shortcut, so this
 * page registers its own `keydown` listener.
 */
export function App() {
  useOverlayBounds();

  useEffect(() => {
    if (host.kind !== "browser") return;
    void applyShortcuts();
  }, []);

  return <OverlayPanel />;
}
