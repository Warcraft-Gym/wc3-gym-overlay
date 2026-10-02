import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "../../../components/Button";
import { host } from "../../../host";
import {
  importReviewBytes,
  isReviewInProgress,
  markReviewSeen,
  onReviewInProgressChanged,
  resolveReview,
  retryReview,
} from "../../../reviews/pipeline";
import { LAST_REVIEW } from "../../../store/keys";
import { useStoreValue } from "../../../store/useStore";
import { installDevInjectReplay } from "./devInjectReplay";
import { REVIEW_DIALOG_ID, ReviewModal } from "./ReviewModal";

const REPLAY_FILE_FILTERS = [{ name: "Warcraft III replay", extensions: ["w3g"] }];

function useReviewInProgress(): boolean {
  return useSyncExternalStore(onReviewInProgressChanged, isReviewInProgress);
}

/**
 * F010 (review-ui) - the picker header's entry point into the post-game
 * review (`LAST_REVIEW`, see `reviews/pipeline.ts`), plus the "Review a
 * replay file..." action that runs the same pipeline against a manually
 * chosen `.w3g` so the feature can be tried without playing a game. Kept
 * self-contained (owns `open`, subscribes to `LAST_REVIEW` and the
 * pipeline's in-progress signal itself) so `pages/picker/App.tsx` only ever
 * has to render `<ReviewLauncher apiBase={...} />` once, next to the
 * existing header controls.
 */
export function ReviewLauncher({ apiBase }: { apiBase: string }) {
  const review = useStoreValue(LAST_REVIEW);
  const inProgress = useReviewInProgress();
  const [open, setOpen] = useState(false);

  // Dev-only `?injectReplay=<url>` convenience - see that module's doc
  // comment. Started once per mount, same shape as the other picker
  // bootstrap effects in `App.tsx`.
  useEffect(() => installDevInjectReplay(), []);

  // F010a - follow-up of F010: a new unseen review can land in
  // `LAST_REVIEW` while the "Last game" view is already open (e.g. a
  // second game finishes before this one is closed) - `handleOpenLastGame`
  // below only clears `seen` at the moment the view is *opened*, so
  // without this, the dot would show next to a view whose (new) content is
  // already on screen. Re-runs whenever `open` or `review` changes, so it
  // also covers the review flipping from unseen to seen right after open
  // (a no-op the second time, since `review.seen` is then already `true`).
  useEffect(() => {
    if (open && review && review.seen === false) {
      void markReviewSeen();
    }
  }, [open, review]);

  function handleOpenLastGame(): void {
    setOpen(true);
    void markReviewSeen();
  }

  async function handleReviewFile(): Promise<void> {
    const picked = await host.openBinaryFile(REPLAY_FILE_FILTERS);
    if (!picked) return;
    setOpen(true);
    void importReviewBytes(picked.bytes, picked.name);
  }

  function handleRetry(): void {
    // A manually-reviewed replay has no real filesystem path to re-read
    // (`source.path` is just the chosen file's own name) - re-open the
    // file dialog instead of calling `retryReview()`, which re-reads by
    // path and would always report "the replay file is no longer there."
    if (review?.manual) {
      void handleReviewFile();
      return;
    }
    void retryReview();
  }

  function handleResolve(meId: number, rememberBattleTag?: string): void {
    if (!review) return;
    void resolveReview(review, meId, rememberBattleTag);
  }

  const hasReview = review !== null;
  const unseen = hasReview && review.seen === false;

  return (
    <>
      <Button
        variant="ghost"
        disabled={!hasReview}
        title={hasReview ? undefined : "Finish a game to see your review here"}
        aria-expanded={open}
        aria-controls={REVIEW_DIALOG_ID}
        onClick={handleOpenLastGame}
      >
        Last game
        {unseen ? (
          <>
            <span aria-hidden="true" className="ml-1 inline-block size-1.5 rounded-full bg-gold" />
            <span className="sr-only">Unseen review</span>
          </>
        ) : null}
      </Button>
      <Button variant="ghost" onClick={() => void handleReviewFile()}>
        Review a replay file…
      </Button>

      {open ? (
        <ReviewModal
          review={review}
          apiBase={apiBase}
          inProgress={inProgress}
          onClose={() => setOpen(false)}
          onRetry={handleRetry}
          onResolve={handleResolve}
        />
      ) : null}
    </>
  );
}
