/**
 * Host abstraction — the overlay app runs either inside a Tauri webview
 * (native windows, global shortcuts, OS opener) or a plain browser tab
 * (dev preview / fallback). Every host-specific capability goes through
 * this interface so the rest of the app never branches on the runtime.
 */

export type ShortcutAction =
  | "toggle_overlay"
  | "timer_play_pause"
  | "timer_reset"
  | "step_next"
  | "step_prev";

export type ShortcutMap = Record<ShortcutAction, string>;

export type ShortcutRegistrationResult = {
  action: ShortcutAction;
  combo: string;
  registered: boolean;
  error?: string;
};

export type WindowBounds = { x: number; y: number; width: number; height: number };

export interface Host {
  readonly kind: "tauri" | "browser";
  showWindow(label: string): Promise<void>;
  hideWindow(label: string): Promise<void>;
  toggleWindow(label: string): Promise<void>;
  isWindowVisible(label: string): Promise<boolean>;
  startDragging(): Promise<void>;
  registerShortcuts(
    map: ShortcutMap,
    onAction: (action: ShortcutAction) => void,
  ): Promise<ShortcutRegistrationResult[]>;
  unregisterAllShortcuts(): Promise<void>;
  notifyStateChanged(): Promise<void>;
  onStateChanged(cb: () => void): () => void;
  openExternal(url: string): Promise<void>;
  /** Current window position/size, or null when unsupported (browser host). */
  getWindowBounds(): Promise<WindowBounds | null>;
  setWindowBounds(bounds: WindowBounds): Promise<void>;
  /** Fires whenever the current window moves or is resized. No-op
   *  unsubscribe / never fires in the browser host. */
  onWindowBoundsChanged(cb: () => void): () => void;
}
