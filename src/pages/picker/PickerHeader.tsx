import { Swords } from "lucide-react";
import { formatCombo } from "../../shortcuts";
import { PickerTabs, type PickerSection } from "./PickerTabs";

/**
 * One bar: the brand, the section tabs, and the opponent window toggle
 * (the only action that works from every tab). Build actions live in the
 * Builds tab (`BuildsToolbar`).
 */
export function PickerHeader({
  tab,
  onTab,
  opponentShortcut,
  onToggleOpponent,
}: {
  tab: PickerSection;
  onTab: (tab: PickerSection) => void;
  opponentShortcut: string;
  onToggleOpponent: () => void;
}) {
  const combo = formatCombo(opponentShortcut);
  return (
    <header className="flex h-14 items-stretch gap-6 border-b border-line/60 px-6">
      <h1 className="flex items-center whitespace-nowrap font-display text-sm font-extrabold uppercase tracking-[0.12em] text-gold">
        Warcraft 3 Gym
      </h1>
      <nav aria-label="Picker" className="flex flex-1 items-stretch">
        <PickerTabs active={tab} onChange={onTab} />
      </nav>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Opponent"
          title={`Show or hide the opponent window (${combo})`}
          onClick={onToggleOpponent}
          className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          <Swords size={15} aria-hidden />
          <span aria-hidden className="hidden font-display uppercase tracking-[0.14em] min-[900px]:inline">
            Opponent
          </span>
          <kbd aria-hidden className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[0.6rem] text-faint">
            {combo}
          </kbd>
        </button>
      </div>
    </header>
  );
}
