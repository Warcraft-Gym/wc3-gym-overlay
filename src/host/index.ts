import type { Host } from "./bridge";
import { createTauriHost } from "./tauri";
import { createBrowserHost } from "./browser";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const host: Host = isTauri() ? createTauriHost() : createBrowserHost();

export type {
  Host,
  ShortcutAction,
  ShortcutMap,
  ShortcutRegistrationResult,
  WindowBounds,
} from "./bridge";
