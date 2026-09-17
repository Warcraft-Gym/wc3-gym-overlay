import { Button } from "../../components/Button";
import type { ApiError, ApiErrorKind } from "../../api/client";

const REASON: Record<ApiErrorKind, string> = {
  network: "the site couldn't be reached",
  http: "the site returned an error",
  invalid: "the site sent back data we couldn't understand",
};

/** Shown when there is truly nothing to show: no cache, and the fetch
 *  failed (or succeeded with zero published builds — `error` is null then). */
export function EmptyState({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 border-dashed px-5 py-12 text-center">
      <p className="text-sm text-muted">
        {error ? `No builds available — ${REASON[error.kind]}.` : "No builds are published yet."}
      </p>
      <Button variant="ghost" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
