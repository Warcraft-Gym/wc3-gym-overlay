import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { IconButton } from "../../../components/IconButton";
import { Modal } from "../../../components/Modal";
import { RaceCrest, RACE_LABEL } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import { parseClock } from "../../../store/timer";
import { humanizeMapName } from "../../../replay/mapName";
import type { EditorFormInput } from "../../../lib/buildEditorSchema";
import type { ExtractBuildOptions, ReplayParseErrorCode, ReplaySummary } from "../../../replay/types";
import type { W3ChampionsErrorCode, W3CMatchSummary } from "../../../replay/w3champions";

// F002: replay parsing/extraction pulls in `w3gjs` (+ protobufjs + the
// Node-built-in polyfills) — every reference to it here is dynamic
// (`await import(...)`) so this modal, and the picker bundle that renders
// its "Import replay" trigger, never eagerly load any of that (see C-606).
type ParseReplayFn = (bytes: Uint8Array) => Promise<ReplaySummary>;
type ExtractBuildFn = (summary: ReplaySummary, playerId: number, opts: ExtractBuildOptions) => EditorFormInput;
type ReplayParseErrorLike = Error & { code: ReplayParseErrorCode };
type ReplayParseErrorCtor = new (code: ReplayParseErrorCode, message: string) => ReplayParseErrorLike;

/** F004: what the modal is showing before a replay has been read — either a
 *  file already picked by the caller, or a W3Champions link/id the user
 *  still needs to type and fetch. */
export type ReplayImportSource = { kind: "file"; bytes: Uint8Array } | { kind: "link" };

type LoadState =
  | { kind: "link"; error?: string; fetching?: boolean }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      summary: ReplaySummary;
      extractBuild: ExtractBuildFn;
      /** F004: set only for a W3Champions-sourced replay. */
      matchId?: string;
      match?: W3CMatchSummary;
    };

const MIN_CUTOFF_SECONDS = 60;
const MAX_CUTOFF_SECONDS = 20 * 60;
const DEFAULT_CUTOFF_SECONDS = 8 * 60;

const W3C_ERROR_MESSAGE: Record<W3ChampionsErrorCode, string> = {
  invalid_ref: "Paste a W3Champions match link (w3champions.com/match/…)",
  not_found: "Match not found on W3Champions",
  unreachable: "Couldn't reach W3Champions",
  bad_response: "W3Champions returned something that isn't a replay",
};

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
 * F002 (file) / F004 (W3Champions link) — shown after the user picks a
 * `.w3g` file via the picker's "Import replay" button, or after they open
 * the "From W3Champions" flow and paste a match link. Either way it ends up
 * parsing a replay (busy state) and lets the user choose a player / cutoff /
 * toggles with a live "N steps" preview before handing a prefilled
 * `EditorFormInput` draft to `onOpenInEditor` — nothing is persisted here;
 * saving happens in `BuildEditorModal`.
 */
export function ReplayImportModal({
  source,
  apiBase,
  onClose,
  onOpenInEditor,
}: {
  source: ReplayImportSource;
  apiBase: string;
  onClose: () => void;
  onOpenInEditor: (draft: EditorFormInput) => void;
}) {
  const [state, setState] = useState<LoadState>(() => (source.kind === "link" ? { kind: "link" } : { kind: "loading" }));
  const [linkText, setLinkText] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [cutoffText, setCutoffText] = useState(formatMmSs(DEFAULT_CUTOFF_SECONDS));
  const [cutoffMs, setCutoffMs] = useState(DEFAULT_CUTOFF_SECONDS * 1000);
  const [includeUpgrades, setIncludeUpgrades] = useState(true);
  const [includeItems, setIncludeItems] = useState(false);

  // Guards every async setState below against firing after the modal has
  // been closed/unmounted (a file parse still in flight, or a W3Champions
  // fetch the user abandoned by hitting Escape).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // F004: deliberately *not* the `autoFocus` prop on the `<input>` below —
  // `Modal`'s own mount effect (a `useEffect`, so a *passive* effect) reads
  // `document.activeElement` to remember what to restore focus to on close,
  // but React applies `autoFocus` during the commit itself (a synchronous,
  // pre-passive-effect step), so the input would already be focused by the
  // time `Modal` looks — capturing the input, not the button that opened
  // this dialog, as "previously focused". `ReplayImportModal` is `Modal`'s
  // *parent*, so its own effects always run after `Modal`'s (child effects
  // fire first) — focusing the input here happens strictly after `Modal`
  // has already captured (and focused) whatever it's going to.
  const linkInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.kind === "link") linkInputRef.current?.focus();
  }, [state]);

  async function loadParsedReplay(bytes: Uint8Array, extra: { matchId?: string; match?: W3CMatchSummary } = {}) {
    const { ReplayParseError } = await import("../../../replay/types");
    try {
      const [{ parseReplay }, { extractBuild }] = await Promise.all([
        import("../../../replay/parseReplay") as Promise<{ parseReplay: ParseReplayFn }>,
        import("../../../replay/extractBuild") as Promise<{ extractBuild: ExtractBuildFn }>,
      ]);
      const summary = await parseReplay(bytes);
      if (!mountedRef.current) return;
      const firstPlayer = summary.players.find((p) => !p.isObserver) ?? null;
      setPlayerId(firstPlayer ? firstPlayer.id : null);
      setState({ kind: "ready", summary, extractBuild, ...extra });
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("Failed to import replay:", err);
      const message = messageForError(err, ReplayParseError);
      // A file import has no retry affordance beyond re-picking a file, so
      // it gets the terminal full-dialog error. A link import keeps its
      // input/Fetch button so the user can paste a different link.
      setState(extra.matchId ? { kind: "link", error: message } : { kind: "error", message });
    }
  }

  useEffect(() => {
    if (source.kind !== "file") return;
    void loadParsedReplay(source.bytes);
  }, [source]);

  async function handleFetch(): Promise<void> {
    const { parseMatchRef } = await import("../../../replay/w3champions");
    const matchId = parseMatchRef(linkText);
    if (!matchId) {
      setState({ kind: "link", error: W3C_ERROR_MESSAGE.invalid_ref });
      return;
    }
    setState({ kind: "link", fetching: true });
    const { fetchW3ChampionsReplay, W3ChampionsError } = await import("../../../replay/w3champions");
    try {
      const result = await fetchW3ChampionsReplay(matchId);
      if (!mountedRef.current) return;
      await loadParsedReplay(result.bytes, { matchId, match: result.match });
    } catch (err) {
      if (!mountedRef.current) return;
      const code = err instanceof W3ChampionsError ? err.code : "unreachable";
      setState({ kind: "link", error: W3C_ERROR_MESSAGE[code] });
    }
  }

  const matchId = state.kind === "ready" ? state.matchId : undefined;
  const opts = useMemo<ExtractBuildOptions>(
    () => ({
      cutoffMs,
      includeUpgrades,
      includeItems,
      sourceLabel: matchId ? `w3champions.com/match/${matchId}` : undefined,
    }),
    [cutoffMs, includeUpgrades, includeItems, matchId],
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
  const winner = state.kind === "ready" ? state.match?.players.find((p) => p.won) : undefined;

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

      {state.kind === "link" ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="block text-xs">
            <span className="mb-1 block font-mono uppercase tracking-[0.14em] text-faint">W3Champions match</span>
            <input
              ref={linkInputRef}
              type="text"
              inputMode="url"
              aria-label="W3Champions match link or id"
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleFetch();
                }
              }}
              placeholder="https://w3champions.com/match/…"
              className="h-9 w-full rounded border border-line bg-surface-2/60 px-2.5 text-sm text-fg outline-none focus:border-gold/60"
            />
          </label>

          {state.fetching ? (
            <p role="status" className="text-sm text-muted">
              Fetching replay from W3Champions…
            </p>
          ) : null}

          {state.error ? (
            <p role="alert" className="rounded border border-loss/50 bg-loss/10 p-3 text-sm text-loss">
              {state.error}
            </p>
          ) : null}

          <div>
            <Button variant="gold" disabled={!!state.fetching} onClick={() => void handleFetch()}>
              Fetch
            </Button>
          </div>
        </div>
      ) : null}

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

          {state.match ? (
            <p className="text-xs text-muted">
              W3Champions · {humanizeMapName(state.match.map)} · winner: {winner?.battleTag ?? "unknown"}
            </p>
          ) : null}

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
