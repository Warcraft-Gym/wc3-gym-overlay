import { FileUp, Link2, Plus, Settings as SettingsIcon, Swords } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button, type ButtonVariant } from "../../components/Button";
import { formatCombo } from "../../shortcuts";
import { SETTINGS_DIALOG_ID } from "./SettingsModal";

const ICON_SIZE = 15;

/**
 * One header action: an icon plus a short label that never wraps. Below
 * ~900 px wide (the picker's minimum is 720) secondary labels collapse to
 * icon-only; the accessible name and the tooltip always carry the full
 * label, so nothing is lost for keyboard or screen-reader users.
 */
function HeaderAction({
  icon,
  label,
  name,
  variant = "ghost",
  collapse = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label?: string;
  /** Accessible name and tooltip. */
  name: string;
  variant?: ButtonVariant;
  /** Hide the visible label on narrow windows. */
  collapse?: boolean;
}) {
  return (
    <Button variant={variant} aria-label={name} title={props.title ?? name} className="whitespace-nowrap" {...props}>
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
      {label ? (
        <span aria-hidden="true" className={collapse ? "hidden min-[900px]:inline" : undefined}>
          {label}
        </span>
      ) : null}
    </Button>
  );
}

export function PickerHeader({
  opponentShortcut,
  settingsOpen,
  onNewBuild,
  onImportReplay,
  onImportFromW3Champions,
  onToggleOpponent,
  onToggleSettings,
}: {
  opponentShortcut: string;
  settingsOpen: boolean;
  onNewBuild: () => void;
  onImportReplay: () => void;
  onImportFromW3Champions: () => void;
  onToggleOpponent: () => void;
  onToggleSettings: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line/60 px-6 py-4">
      <div className="min-w-0">
        <h1 className="whitespace-nowrap font-display text-sm font-extrabold uppercase tracking-[0.12em] text-gold">
          Warcraft 3 Gym
        </h1>
        <p className="text-xs text-muted">Build picker</p>
      </div>
      <nav aria-label="Picker actions" className="flex shrink-0 items-center gap-2">
        <HeaderAction
          variant="gold"
          icon={<Plus size={ICON_SIZE} strokeWidth={2.5} />}
          label="New build"
          name="New private build"
          collapse={false}
          onClick={onNewBuild}
        />
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
        <HeaderAction icon={<FileUp size={ICON_SIZE} />} label="Import replay" name="Import replay" onClick={onImportReplay} />
        <HeaderAction
          icon={<Link2 size={ICON_SIZE} />}
          label="W3C link"
          name="From W3Champions"
          title="Import a build from a W3Champions match link"
          onClick={onImportFromW3Champions}
        />
        <HeaderAction
          icon={<Swords size={ICON_SIZE} />}
          label="Opponent"
          name="Opponent"
          title={`Show or hide the opponent window (${formatCombo(opponentShortcut)})`}
          onClick={onToggleOpponent}
        />
        <HeaderAction
          icon={<SettingsIcon size={ICON_SIZE} />}
          name="Settings"
          aria-expanded={settingsOpen}
          aria-controls={SETTINGS_DIALOG_ID}
          onClick={onToggleSettings}
        />
      </nav>
    </header>
  );
}
