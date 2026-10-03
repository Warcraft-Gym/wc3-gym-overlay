import { useState } from "react";
import { TextField } from "../../components/TextField";
import { isValidBattleTag } from "../../opponentWatcher";
import { OPPONENT, SETTINGS, type OpponentState, type Settings } from "../../store/keys";
import { updateKey } from "../../store/state";
import { useStoreValue } from "../../store/useStore";

/** One line saying what the opponent watcher is doing right now. */
export function opponentStatusText(settings: Pick<Settings, "myBattleTag" | "opponentCard">, state: OpponentState): string {
  if (!settings.opponentCard) return "The opponent card is off.";
  if (!settings.myBattleTag || !isValidBattleTag(settings.myBattleTag)) return "Enter your BattleTag to get the opponent card.";
  const name = state.card?.opponent.battleTag;
  if (state.live && state.status === "loading") return "In a game, looking up your opponent…";
  if (state.live && name) return `In a game vs ${name}.`;
  if (state.live && state.status === "error") return state.error ?? "Couldn't load your opponent.";
  if (name) return `Waiting for your next W3Champions game. Last opponent: ${name}.`;
  return "Waiting for your next W3Champions 1v1.";
}

/** Settings section: the BattleTag the opponent card watches, and its switch. */
export function W3ChampionsSettings({ settings }: { settings: Settings }) {
  const state = useStoreValue(OPPONENT);
  const [input, setInput] = useState(settings.myBattleTag ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleChange(value: string): void {
    setInput(value);
    const trimmed = value.trim();
    if (trimmed === "") {
      setError(null);
      void updateKey(SETTINGS, (s) => ({ ...s, myBattleTag: null }));
      return;
    }
    if (!isValidBattleTag(trimmed)) {
      setError("Use your full BattleTag, e.g. Name#1234");
      return;
    }
    setError(null);
    void updateKey(SETTINGS, (s) => ({ ...s, myBattleTag: trimmed }));
  }

  return (
    <div className="space-y-3">
      <TextField
        label="Your BattleTag"
        placeholder="Name#1234"
        autoComplete="off"
        spellCheck={false}
        value={input}
        error={error}
        onChange={(e) => handleChange(e.target.value)}
      />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.opponentCard}
          onChange={(e) => void updateKey(SETTINGS, (s) => ({ ...s, opponentCard: e.target.checked }))}
        />
        Show the opponent card when a 1v1 starts
      </label>
      <label className="mt-1 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={settings.opponentAutoOpen}
          disabled={!settings.opponentCard}
          onChange={(e) => void updateKey(SETTINGS, (s) => ({ ...s, opponentAutoOpen: e.target.checked }))}
        />
        Open the opponent window by itself
      </label>
      <p className="mt-2 text-xs text-muted" data-testid="opponent-status">
        {opponentStatusText(settings, state)}
      </p>
      <p className="mt-1 text-xs text-faint">
        Uses public W3Champions ladder data. Only W3Champions 1v1 games are detected.
      </p>
    </div>
  );
}
