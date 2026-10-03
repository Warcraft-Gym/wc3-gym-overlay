import { FileUp, Link2, Plus } from "lucide-react";
import { Button } from "../../components/Button";

const ICON_SIZE = 15;

/** The Builds tab's own actions, shown in the header while that tab is
 *  open: import from a replay file or a W3Champions link (icon buttons,
 *  named by tooltip and aria-label), and the one primary action, New build. */
export function BuildsToolbar({
  onNewBuild,
  onImportReplay,
  onImportFromW3Champions,
}: {
  onNewBuild: () => void;
  onImportReplay: () => void;
  onImportFromW3Champions: () => void;
}) {
  return (
    <div role="toolbar" aria-label="Build actions" className="flex items-center gap-2">
      <Button size="sm" variant="ghost" aria-label="Import replay" title="Import a build from a replay file" onClick={onImportReplay}>
        <FileUp size={ICON_SIZE} aria-hidden />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="From W3Champions"
        title="Import a build from a W3Champions match link"
        onClick={onImportFromW3Champions}
      >
        <Link2 size={ICON_SIZE} aria-hidden />
      </Button>
      <Button size="sm" variant="gold" aria-label="New private build" title="New private build" onClick={onNewBuild} className="whitespace-nowrap">
        <Plus size={ICON_SIZE} strokeWidth={2.5} aria-hidden />
        <span aria-hidden>New build</span>
      </Button>
    </div>
  );
}
