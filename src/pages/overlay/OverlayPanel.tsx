import { useState } from "react";
import { useClock } from "../../data/useClock";
import { useSelectedBuild } from "../../data/useSelectedBuild";
import { SETTINGS } from "../../store/keys";
import { useStoreValue } from "../../store/useStore";
import { NoBuildSelected } from "./NoBuildSelected";
import { PanelHeader } from "./PanelHeader";
import { StepList } from "./StepList";

/**
 * The whole in-game panel — this window's contents. `opacity`/`scale` come
 * straight from settings and are applied on this root node (not `html`/
 * `body`, which must stay transparent so the OS-level window transparency
 * shows through around the panel's rounded corners).
 */
export function OverlayPanel() {
  const settings = useStoreValue(SETTINGS);
  const build = useSelectedBuild();
  const clock = useClock();
  const [compact, setCompact] = useState(false);

  return (
    <div
      data-overlay-root
      style={{ opacity: settings.opacity, transform: `scale(${settings.scale})`, transformOrigin: "top left" }}
    >
      <PanelHeader
        build={build}
        apiBase={settings.apiBase}
        clock={clock}
        compact={compact}
        onToggleCompact={() => setCompact((current) => !current)}
      />
      {build ? <StepList build={build} clock={clock} compact={compact} /> : <NoBuildSelected />}
    </div>
  );
}
