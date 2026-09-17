import { Button } from "../../components/Button";
import { relativeTime } from "../../lib/relativeTime";

/** Shown when a fetch fails but the cache still has builds to display. */
export function OfflineBanner({ fetchedAt, onRetry }: { fetchedAt: string; onRetry: () => void }) {
  return (
    <div role="status" className="panel flex flex-wrap items-center justify-between gap-3 border-loss/40 px-4 py-2.5 text-sm">
      <span className="text-muted">
        Offline — showing builds from {fetchedAt ? relativeTime(fetchedAt, Date.now()) : "an earlier session"}.
      </span>
      <Button variant="ghost" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
