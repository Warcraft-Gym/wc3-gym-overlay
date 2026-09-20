/**
 * F002: the update banner — rendered at the top of the picker, above the
 * header, whenever `useUpdateFlow`'s state isn't `idle`. A portable build
 * (see `UpdateInfo.portable`) never gets an in-place install: it always
 * shows a download link instead, regardless of which non-idle state the
 * flow is in (there's nothing to install, so it never leaves `available`).
 */
import { Button } from "../../components/Button";
import { host } from "../../host";
import { RELEASES_PAGE_URL } from "../../config";
import type { UpdateFlow } from "./useUpdateFlow";

const NOTES_MAX_LENGTH = 200;

function percentOf(progress: { downloaded: number; contentLength: number | null }): number {
  if (!progress.contentLength) return 0;
  return Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100));
}

export function UpdateBanner({ flow }: { flow: UpdateFlow }) {
  const { state, later, skip, install } = flow;

  if (state.kind === "idle") return null;

  if (state.kind === "installing" || state.kind === "relaunching") {
    const percent = state.kind === "installing" ? percentOf(state.progress) : 100;
    return (
      <div role="status" className="panel flex items-center gap-4 rounded-none border-x-0 border-t-0 px-6 py-3 text-sm">
        <span className="text-muted">Installing…</span>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-gold transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div
        role="status"
        className="panel flex flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 border-loss/40 px-6 py-3 text-sm"
      >
        <span className="text-muted">Update failed — try again or download from the releases page</span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void install()}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void host.openExternal(RELEASES_PAGE_URL)}>
            Releases
          </Button>
        </div>
      </div>
    );
  }

  // state.kind === "available"
  if (state.info.portable) {
    const downloadUrl = state.info.downloadUrl ?? RELEASES_PAGE_URL;
    return (
      <div role="status" className="panel flex flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-6 py-3 text-sm">
        <span className="text-muted">
          A new version is available ({state.info.version}) — download the portable build
        </span>
        <div className="flex gap-2">
          <Button variant="gold" onClick={() => void host.openExternal(downloadUrl)}>
            Download
          </Button>
          <Button variant="ghost" onClick={later}>
            Later
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="panel flex flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-6 py-3 text-sm">
      <div>
        <p className="text-fg">Version {state.info.version} available</p>
        {state.info.notes ? (
          <p className="mt-0.5 text-xs text-faint">{state.info.notes.slice(0, NOTES_MAX_LENGTH)}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button variant="gold" onClick={() => void install()}>
          Update &amp; restart
        </Button>
        <Button variant="ghost" onClick={later}>
          Later
        </Button>
        <Button variant="ghost" onClick={skip}>
          Skip this version
        </Button>
      </div>
    </div>
  );
}
