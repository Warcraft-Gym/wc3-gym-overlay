import { useEffect, useRef, useState } from "react";
import { Button } from "../../../components/Button";
import { IconButton } from "../../../components/IconButton";
import { Modal } from "../../../components/Modal";
import { RaceCrest, RACE_LABEL, type Race } from "../../../components/RaceCrest";
import { cn } from "../../../lib/cn";
import { parseClock } from "../../../store/timer";
import {
  ReplayImportError,
  replayBuildToFormInput,
  requestReplayImport,
  type ReplayImportResponse,
  type ReplayImportSourcePayload,
} from "../../../api/replayImport";
import type { EditorFormInput } from "../../../lib/buildEditorSchema";

/** F004: what the modal is showing before an import has resolved — either a
 *  file already picked by the caller, or a W3Champions link/id the user
 *  still needs to type and submit. */
export type ReplayImportSource = { kind: "file"; bytes: Uint8Array; fileName: string } | { kind: "link" };

type LoadState =
  | { kind: "link"; error?: string; fetching?: boolean }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: ReplayImportResponse };

function isKnownRace(race: string): race is Race {
  return race in RACE_LABEL;
}

// F004a: the cutoff/upgrades/items controls F004 removed, restored with the
// same defaults/feel as the pre-F004 screen (`origin/main`'s
// `ReplayImportModal.tsx`) but now sent to the API as `cutoffSeconds` /
// `includeUpgrades` / `includeItems` instead of driving a local parse.
const MIN_CUTOFF_SECONDS = 60;
const MAX_CUTOFF_SECONDS = 20 * 60;
const DEFAULT_CUTOFF_SECONDS = 8 * 60;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "mm:ss", always rendered with a zero-padded 2-digit minute (the field's
 *  own default value is "08:00", not "8:00"). */
function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * F002 (file) / F004 (W3Champions link, API-backed import) / F004a (cutoff,
 * include-upgrades, include-items controls) — shown after the user picks a
 * `.w3g` file via the picker's "Import replay" button, or after they open
 * the "From W3Champions" flow and paste a match link. Either way this POSTs
 * to the website's `/api/replay-import` (never parses a replay locally —
 * see `src/api/replayImport.ts`), lets the user choose a player, an import
 * cutoff, and toggle "include upgrades" / "include items" / "drop
 * likely-rejected orders" (each of which re-requests the API), then hands
 * that player's `build` to `onOpenInEditor` — nothing is persisted here;
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
  const [payload, setPayload] = useState<ReplayImportSourcePayload | null>(
    source.kind === "file" ? { kind: "file", bytes: source.bytes, fileName: source.fileName } : null,
  );
  const [state, setState] = useState<LoadState>(() => (source.kind === "link" ? { kind: "link" } : { kind: "loading" }));
  const [linkText, setLinkText] = useState("");
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [dropLikelyRejected, setDropLikelyRejected] = useState(true);
  // F004a: `cutoffSeconds` is the applied value (drives the request);
  // `cutoffText` is the raw field contents, which can be transiently
  // invalid while the user is typing — they only reconcile on blur/Enter
  // (see `commitCutoff`), so keystrokes never fire a request per se.
  const [cutoffSeconds, setCutoffSeconds] = useState(DEFAULT_CUTOFF_SECONDS);
  const [cutoffText, setCutoffText] = useState(formatMmSs(DEFAULT_CUTOFF_SECONDS));
  const [cutoffError, setCutoffError] = useState<string | undefined>(undefined);
  const [includeUpgrades, setIncludeUpgrades] = useState(true);
  const [includeItems, setIncludeItems] = useState(false);

  // Guards every async setState below against firing after the modal has
  // been closed/unmounted (an import still in flight when the user hits
  // Escape or clicks Cancel).
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

  // F004: the one place that actually calls the API — fires whenever a
  // source `payload` is available (immediately for a file, only after the
  // user clicks Fetch for a link) and re-fires whenever `dropLikelyRejected`
  // changes, since that toggle is a server-side filter, not a client-side
  // recompute (see the API's `dropLikelyRejected` field). F004a: also
  // re-fires on `cutoffSeconds` (only after it's been committed — see
  // `commitCutoff`), `includeUpgrades` and `includeItems`, same reasoning.
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    setState(payload.kind === "match" ? { kind: "link", fetching: true } : { kind: "loading" });
    requestReplayImport(apiBase, payload, { dropLikelyRejected, cutoffSeconds, includeUpgrades, includeItems })
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setState({ kind: "ready", data });
        setPlayerId((prev) => (prev !== null && data.players.some((p) => p.id === prev) ? prev : (data.players[0]?.id ?? null)));
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        console.error("Failed to import replay:", err);
        const message = err instanceof ReplayImportError ? err.message : "Couldn't read this replay.";
        setState(payload.kind === "match" ? { kind: "link", error: message } : { kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [payload, dropLikelyRejected, cutoffSeconds, includeUpgrades, includeItems, apiBase]);

  // F004a: applies the cutoff field on blur/Enter — never on every
  // keystroke, so typing doesn't fire a request per key (production is
  // rate-limited). An unparseable "m:ss" shows an inline error and leaves
  // `cutoffSeconds` (and so the last request) untouched; a parseable value
  // out of range is clamped, same feel as the pre-F004 screen.
  function commitCutoff(): void {
    const parsed = parseClock(cutoffText.trim());
    if (parsed === undefined) {
      setCutoffError("Enter a time as m:ss, e.g. 8:00.");
      return;
    }
    const clamped = Math.min(MAX_CUTOFF_SECONDS, Math.max(MIN_CUTOFF_SECONDS, parsed));
    setCutoffError(undefined);
    setCutoffText(formatMmSs(clamped));
    setCutoffSeconds(clamped);
  }

  function handleFetch(): void {
    const trimmed = linkText.trim();
    if (!trimmed) {
      setState({ kind: "link", error: "Paste a W3Champions match link or id." });
      return;
    }
    setPayload({ kind: "match", match: trimmed });
  }

  const players = state.kind === "ready" ? state.data.players : [];
  const selectedPlayer = players.find((p) => p.id === playerId) ?? null;
  const draft = selectedPlayer ? replayBuildToFormInput(selectedPlayer.build) : null;
  const stepCount = draft?.steps.length ?? 0;
  const droppedCount = selectedPlayer?.dropped ?? 0;
  const busy = state.kind === "loading" || (state.kind === "link" && !!state.fetching);
  const title = state.kind === "ready" ? state.data.map : "Import replay";

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
                  handleFetch();
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
            <Button variant="gold" disabled={!!state.fetching} onClick={handleFetch}>
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
            {state.data.map} · v{state.data.version} · {state.data.duration}
          </p>
          <p className="text-xs text-muted">{state.data.source.label}</p>

          <div>
            <span className="kicker mb-2 block">Player</span>
            <div role="radiogroup" aria-label="Player" className="flex flex-col gap-2">
              {players.map((player) => {
                const race: Race = isKnownRace(player.race) ? player.race : "random";
                const raceLabel = isKnownRace(player.race) ? RACE_LABEL[player.race] : player.race;
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
                    <RaceCrest race={race} apiBase={apiBase} size={20} />
                    <span className="flex-1">{name}</span>
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
              aria-invalid={cutoffError ? true : undefined}
              aria-describedby={cutoffError ? "replay-import-cutoff-error" : undefined}
              value={cutoffText}
              onChange={(event) => setCutoffText(event.target.value)}
              onBlur={commitCutoff}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCutoff();
                }
              }}
              className="tnum h-9 w-24 rounded border border-line bg-surface-2/60 px-2.5 text-sm text-fg outline-none focus:border-gold/60"
            />
          </label>

          {cutoffError ? (
            <p id="replay-import-cutoff-error" role="alert" className="text-sm text-loss">
              {cutoffError}
            </p>
          ) : null}

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
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dropLikelyRejected}
                onChange={(event) => setDropLikelyRejected(event.target.checked)}
              />
              Drop orders the game likely rejected
            </label>
          </div>

          <p className="tnum" data-preview-count={stepCount} data-dropped-count={droppedCount}>
            {droppedCount > 0 ? `${stepCount} steps · ${droppedCount} dropped` : `${stepCount} steps`}
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
