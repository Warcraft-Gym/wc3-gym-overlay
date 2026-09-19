import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { IconButton } from "../../../components/IconButton";
import { Modal } from "../../../components/Modal";
import { RaceCrest, RACE_LABEL } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import { parseClock } from "../../../store/timer";
import type { EditorFormInput } from "../../../lib/buildEditorSchema";
import type { ExtractBuildOptions, ReplayParseErrorCode, ReplaySummary } from "../../../replay/types";

// F002: replay parsing/extraction pulls in `w3gjs` (+ protobufjs + the
// Node-built-in polyfills) — every reference to it here is dynamic
// (`await import(...)`) so this modal, and the picker bundle that renders
// its "Import replay" trigger, never eagerly load any of that (see C-606).
type ParseReplayFn = (bytes: Uint8Array) => Promise<ReplaySummary>;
type ExtractBuildFn = (summary: ReplaySummary, playerId: number, opts: ExtractBuildOptions) => EditorFormInput;
type ReplayParseErrorLike = Error & { code: ReplayParseErrorCode };
type ReplayParseErrorCtor = new (code: ReplayParseErrorCode, message: string) => ReplayParseErrorLike;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; summary: ReplaySummary; extractBuild: ExtractBuildFn };

const MIN_CUTOFF_SECONDS = 60;
const MAX_CUTOFF_SECONDS = 20 * 60;
const DEFAULT_CUTOFF_SECONDS = 8 * 60;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "m:ss"/"mm:ss", always rendered with a zero-padded 2-digit minute (the
 *  field's own default value is "08:00", not "8:00"). */
function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

function isReplayParseError(err: unknown, ctor: ReplayParseErrorCtor): err is ReplayParseErrorLike {
  return err instanceof ctor;
}

function messageForError(err: unknown, ctor: ReplayParseErrorCtor): string {
  if (isReplayParseError(err, ctor)) {
    if (err.code === "not_a_replay") return "Not a Warcraft III replay";
    if (err.code === "unsupported_version") {
      const match = err.message.match(/version\s+([^\s.]+(?:\.[^\s.,]+)*)/i);
      return `Unsupported replay version (${match ? match[1] : "unknown"})`;
    }
    // "corrupt"
    return "Couldn't read this replay";
  }
  return "Couldn't read this replay";
}

/**
 * F002 — shown after the user picks a `.w3g` file via the picker's "Import
 * replay" button. Parses the replay (busy state), then lets the user choose
 * a player / cutoff / toggles with a live "N steps" preview before handing
 * a prefilled `EditorFormInput` draft to `onOpenInEditor` — nothing is
 * persisted here; saving happens in `BuildEditorModal`.
 */
export function ReplayImportModal({
  fileBytes,
  apiBase,
  onClose,
  onOpenInEditor,
}: {
  fileBytes: Uint8Array;
  apiBase: string;
  onClose: () => void;
  onOpenInEditor: (draft: EditorFormInput) => void;
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [cutoffText, setCutoffText] = useState(formatMmSs(DEFAULT_CUTOFF_SECONDS));
  const [cutoffMs, setCutoffMs] = useState(DEFAULT_CUTOFF_SECONDS * 1000);
  const [includeUpgrades, setIncludeUpgrades] = useState(true);
  const [includeItems, setIncludeItems] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const { ReplayParseError } = await import("../../../replay/types");
      try {
        const [{ parseReplay }, { extractBuild }] = await Promise.all([
          import("../../../replay/parseReplay") as Promise<{ parseReplay: ParseReplayFn }>,
          import("../../../replay/extractBuild") as Promise<{ extractBuild: ExtractBuildFn }>,
        ]);
        const summary = await parseReplay(fileBytes);
        if (cancelled) return;
        const firstPlayer = summary.players.find((p) => !p.isObserver) ?? null;
        setPlayerId(firstPlayer ? firstPlayer.id : null);
        setState({ kind: "ready", summary, extractBuild });
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to import replay:", err);
        setState({ kind: "error", message: messageForError(err, ReplayParseError) });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fileBytes]);

  const opts = useMemo<ExtractBuildOptions>(
    () => ({ cutoffMs, includeUpgrades, includeItems }),
    [cutoffMs, includeUpgrades, includeItems],
  );

  const draft = useMemo(() => {
    if (state.kind !== "ready" || playerId === null) return null;
    try {
      return state.extractBuild(state.summary, playerId, opts);
    } catch (err) {
      console.error("Failed to extract a build from this replay:", err);
      return null;
    }
  }, [state, playerId, opts]);

  const stepCount = draft?.steps.length ?? 0;
  const busy = state.kind === "loading";
  const title = state.kind === "ready" ? state.summary.map.name : "Import replay";

  function handleCutoffBlur() {
    const parsedSeconds = parseClock(cutoffText.trim());
    if (parsedSeconds === undefined) {
      setCutoffText(formatMmSs(Math.round(cutoffMs / 1000)));
      return;
    }
    const clamped = Math.min(MAX_CUTOFF_SECONDS, Math.max(MIN_CUTOFF_SECONDS, parsedSeconds));
    setCutoffMs(clamped * 1000);
    setCutoffText(formatMmSs(clamped));
  }

  return (
    <Modal label="Import replay" onClose={onClose} widthClassName="w-[min(34rem,calc(100vw-2rem))]">
      <div className="flex items-center justify-between">
        <div>
          <p className="kicker">Import replay</p>
          <h2 className="text-base">{title}</h2>
        </div>
        <IconButton aria-label="Close import" onClick={onClose}>
          ×
        </IconButton>
      </div>

      {state.kind === "loading" ? (
        <p role="status" className="mt-4 text-sm text-muted">
          Reading replay…
        </p>
      ) : null}

      {state.kind === "error" ? (
        <p role="alert" className="mt-4 rounded border border-loss/50 bg-loss/10 p-3 text-sm text-loss">
          {state.message}
        </p>
      ) : null}

      {state.kind === "ready" ? (
        <div className="mt-4 flex flex-col gap-4">
          <p className="tnum text-xs text-muted">
            {state.summary.map.name} · v{state.summary.version} ·{" "}
            {formatMmSs(Math.round(state.summary.durationMs / 1000))}
          </p>

          <div>
            <span className="kicker mb-2 block">Player</span>
            <div role="radiogroup" aria-label="Player" className="flex flex-col gap-2">
              {state.summary.players
                .filter((player) => !player.isObserver)
                .map((player) => {
                  const raceLabel = RACE_LABEL[player.raceDetected];
                  const name = `${player.name} · ${raceLabel}`;
                  const checked = playerId === player.id;
                  return (
                    <label
                      key={player.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded border p-2 text-sm",
                        checked ? "border-gold/60 bg-gold/5" : "border-line",
                      )}
                    >
                      <input
                        type="radio"
                        name="replay-import-player"
                        aria-label={name}
                        checked={checked}
                        onChange={() => setPlayerId(player.id)}
                      />
                      <RaceCrest race={player.raceDetected} apiBase={apiBase} size={20} />
                      <span className="flex-1">{name}</span>
                      <span className="tnum text-xs text-faint">Team {player.teamId}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block font-mono uppercase tracking-[0.14em] text-faint">Import up to</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Import up to"
              value={cutoffText}
              onChange={(event) => setCutoffText(event.target.value)}
              onBlur={handleCutoffBlur}
              className="tnum h-9 w-24 rounded border border-line bg-surface-2/60 px-2.5 text-sm text-fg outline-none focus:border-gold/60"
            />
          </label>

          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeUpgrades}
                onChange={(event) => setIncludeUpgrades(event.target.checked)}
              />
              Include upgrades
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeItems}
                onChange={(event) => setIncludeItems(event.target.checked)}
              />
              Include items
            </label>
          </div>

          <p className="tnum" data-preview-count={stepCount}>
            {stepCount} steps
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="gold"
          disabled={busy || stepCount === 0 || !draft}
          onClick={() => {
            if (draft) onOpenInEditor(draft);
          }}
        >
          Open in editor
        </Button>
      </div>
    </Modal>
  );
}
