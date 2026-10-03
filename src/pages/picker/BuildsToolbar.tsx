import { FileUp, Link2, Plus } from "lucide-react";
import { Button } from "../../components/Button";

const ICON_SIZE = 15;

/** The Builds tab's own actions: make a build, or import one from a replay
 *  file or a W3Champions match link. Secondary labels collapse to icons on
 *  narrow windows; the accessible names never change. */
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
    <div role="toolbar" aria-label="Build actions" className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="ghost" aria-label="Import replay" title="Import replay" onClick={onImportReplay} className="whitespace-nowrap">
        <FileUp size={ICON_SIZE} aria-hidden />
        <span aria-hidden className="hidden min-[900px]:inline">
          Import replay
        </span>
      </Button>
      <Button
        variant="ghost"
        aria-label="From W3Champions"
        title="Import a build from a W3Champions match link"
        onClick={onImportFromW3Champions}
        className="whitespace-nowrap"
      >
        <Link2 size={ICON_SIZE} aria-hidden />
        <span aria-hidden className="hidden min-[900px]:inline">
          W3C link
        </span>
      </Button>
      <Button variant="gold" aria-label="New private build" title="New private build" onClick={onNewBuild} className="whitespace-nowrap">
        <Plus size={ICON_SIZE} strokeWidth={2.5} aria-hidden />
        <span aria-hidden>New build</span>
      </Button>
    </div>
  );
}
