import { BookOpen, UserRound, type LucideIcon } from "lucide-react";
import type { KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import type { PickerTab } from "../../store/keys";

const TABS: { id: PickerTab; label: string; icon: LucideIcon }[] = [
  { id: "builds", label: "Builds", icon: BookOpen },
  { id: "profile", label: "Profile", icon: UserRound },
];

export const tabId = (tab: PickerTab) => `picker-tab-${tab}`;
export const panelId = (tab: PickerTab) => `picker-panel-${tab}`;

/** Builds | Profile, under the header. Arrow keys move between tabs. */
export function PickerTabs({ active, onChange }: { active: PickerTab; onChange: (tab: PickerTab) => void }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = TABS.findIndex((t) => t.id === active);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    onChange(next.id);
    document.getElementById(tabId(next.id))?.focus();
  }
  return (
    <div role="tablist" aria-label="Picker sections" onKeyDown={onKeyDown} className="flex gap-1 border-b border-line">
      {TABS.map(({ id, label, icon: Icon }) => {
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
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 font-display text-xs uppercase tracking-[0.14em] transition-colors",
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
