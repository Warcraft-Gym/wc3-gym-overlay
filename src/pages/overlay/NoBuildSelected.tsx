import { Button } from "../../components/Button";
import { WINDOW_PICKER } from "../../config";
import { host } from "../../host";

/** Body content when no build is selected yet. The header (clock, Hide,
 *  Play/Reset/Compact) still renders above this — see `PanelHeader`. */
export function NoBuildSelected() {
  return (
    <div className="overlay-empty">
      <p>No build selected yet.</p>
      <Button variant="gold" onClick={() => void host.showWindow(WINDOW_PICKER)}>
        Open build picker
      </Button>
    </div>
  );
}
