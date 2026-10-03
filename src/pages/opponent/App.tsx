import { useOverlayBounds } from "../../data/useOverlayBounds";
import { OpponentPanel } from "./OpponentPanel";
import "../overlay/overlay.css";

/**
 * The opponent window: a transparent, draggable, always-on-top window like
 * the build-order overlay, opened and closed on its own (picker button,
 * shortcut, or automatically when a W3Champions 1v1 starts). It only reads
 * the store; the picker window's watcher writes the card.
 */
export function App() {
  useOverlayBounds("opponentBounds");
  return <OpponentPanel />;
}
