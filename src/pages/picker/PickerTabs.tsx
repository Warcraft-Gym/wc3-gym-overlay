import { BookOpen, Settings as SettingsIcon, UserRound, type LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "../../lib/cn";

/** The picker's sections. Settings is a tab too, but is never remembered:
 *  the app always reopens on Builds or Profile. */
export type PickerSection = "builds" | "profile" | "settings";

export const ALL_SECTIONS: readonly PickerSection[] = ["builds", "profile", "settings"];

const TABS: { id: PickerSection; label: string; icon: LucideIcon }[] = [
  { id: "builds", label: "Builds", icon: BookOpen },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export const tabId = (tab: PickerSection) => `picker-tab-${tab}`;
export const panelId = (tab: PickerSection) => `picker-panel-${tab}`;

/** Builds | Profile | Settings, inside the header. Arrow keys move between
 *  tabs. The active tab's underline sits on the header's bottom border. */
export function PickerTabs({
  active,
  onChange,
  sections = ALL_SECTIONS,
}: {
  active: PickerSection;
  onChange: (tab: PickerSection) => void;
  /** The tabs this build offers (Profile only with the scouting features). */
  sections?: readonly PickerSection[];
}) {
  const tabs = TABS.filter((t) => sections.includes(t.id));
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((t) => t.id === active);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(tabId(next.id))?.focus();
  }
  return (
    <div role="tablist" aria-label="Picker sections" onKeyDown={onKeyDown} className="flex h-full items-stretch gap-1">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            id={tabId(id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 font-display text-xs uppercase tracking-[0.14em] transition-colors min-[900px]:px-4",
              selected ? "border-gold text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            <Icon size={15} aria-hidden className={selected ? "text-gold" : undefined} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
