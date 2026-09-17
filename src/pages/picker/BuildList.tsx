import { BuildRow } from "./BuildRow";
import type { ApiBuildListItem } from "../../api/schema";

function SkeletonRow({ index }: { index: number }) {
  return (
    <li
      aria-hidden="true"
      className="panel flex h-[4.75rem] items-center gap-3 overflow-hidden px-4 py-2.5"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="size-6 shrink-0 animate-pulse rounded-full bg-surface-3" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-3" />
        <div className="h-2.5 w-2/3 animate-pulse rounded bg-surface-3" />
      </div>
    </li>
  );
}

export function BuildList({
  builds,
  apiBase,
  selectedSlug,
  onSelect,
  loading,
}: {
  builds: ApiBuildListItem[];
  apiBase: string;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  loading: boolean;
}) {
  return (
    <ul aria-label="Build orders" className="grid gap-2">
      {loading
        ? Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} index={i} />)
        : builds.map((build) => (
            <BuildRow
              key={build.slug}
              build={build}
              apiBase={apiBase}
              selected={build.slug === selectedSlug}
              onSelect={() => onSelect(build.slug)}
            />
          ))}
    </ul>
  );
}
