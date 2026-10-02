/**
 * F010 (review-ui) - the picker header's entry point: wiring between the
 * "Last game" / "Review a replay file..." controls, the real `LAST_REVIEW`
 * store, and `reviews/pipeline.ts`. `importReviewBytes` / `retryReview` /
 * `resolveReview` are mocked (no real network/import should ever run from
 * these tests); `markReviewSeen` is left real since it only touches
 * `localStorage` - see the "dot clears on open" test, which relies on it
 * actually writing back.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { host } from "../../../host";
import { LAST_REVIEW } from "../../../store/keys";
import { readKey, writeKey } from "../../../store/state";
import type { Review } from "../../../reviews/types";

const importReviewBytesMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const retryReviewMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const resolveReviewMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../../reviews/pipeline", async () => {
  const actual = await vi.importActual<typeof import("../../../reviews/pipeline")>("../../../reviews/pipeline");
  return {
    ...actual,
    importReviewBytes: importReviewBytesMock,
    retryReview: retryReviewMock,
    resolveReview: resolveReviewMock,
  };
});

const { ReviewLauncher } = await import("./ReviewLauncher");

function okReview(overrides: Partial<Review> = {}): Review {
  return {
    id: "r1",
    createdAt: "2026-01-01T00:00:00.000Z",
    source: { path: "/x/LastReplay.w3g", mtimeMs: 1000 },
    status: "ok",
    map: "lastrefuge.anon",
    duration: "11:03",
    players: [
      { id: 1, name: "Me#1111", race: "orc", steps: [] },
      { id: 2, name: "Foe#2222", race: "undead", steps: [] },
    ],
    meId: 1,
    meStatus: "resolved",
    plan: null,
    comparison: null,
    seen: false,
    ...overrides,
  };
}

describe("ReviewLauncher", () => {
  beforeEach(() => {
    localStorage.clear();
    importReviewBytesMock.mockClear();
    retryReviewMock.mockClear();
    resolveReviewMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  it("is disabled with a hint when there is no review yet", async () => {
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);
    const button = await screen.findByRole("button", { name: "Last game" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.title).toBe("Finish a game to see your review here");
  });

  it("shows an unseen dot for an unseen review and clears it on open", async () => {
    await writeKey(LAST_REVIEW, okReview({ seen: false }));
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    const button = await screen.findByRole("button", { name: /Last game/ });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Unseen review")).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => expect(screen.queryByText("Unseen review")).toBeNull());
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Last game" })).toBeTruthy());
  });

  // F010a – follow-up of F010: a review landing *while the view is already
  // open* (e.g. a second game finishes before the first review is closed)
  // used to leave `seen: false` forever – nothing re-ran `markReviewSeen()`
  // until the view was closed and reopened, so the dot showed next to a
  // view whose (new) content was already on screen.
  it("marks a new review seen as soon as it lands while the view is already open", async () => {
    await writeKey(LAST_REVIEW, okReview({ id: "r1", seen: false }));
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Last game/ }));
    await waitFor(() => expect(screen.queryByText("Unseen review")).toBeNull());

    await writeKey(LAST_REVIEW, okReview({ id: "r2", seen: false }));
    expect(readKey(LAST_REVIEW)?.seen).toBe(false);

    await waitFor(() => expect(readKey(LAST_REVIEW)?.seen).toBe(true));
    await waitFor(() => expect(screen.queryByText("Unseen review")).toBeNull());
  });

  it("'Review a replay file...' opens the dialog and runs the pipeline against the picked bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.spyOn(host, "openBinaryFile").mockResolvedValue({ name: "my-game.w3g", bytes });
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    const button = await screen.findByRole("button", { name: "Review a replay file…" });
    fireEvent.click(button);

    await waitFor(() => expect(host.openBinaryFile).toHaveBeenCalledWith([{ name: "Warcraft III replay", extensions: ["w3g"] }]));
    await waitFor(() => expect(importReviewBytesMock).toHaveBeenCalledWith(bytes, "my-game.w3g"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Last game" })).toBeTruthy());
  });

  it("'Review a replay file...' does nothing when the dialog is cancelled", async () => {
    vi.spyOn(host, "openBinaryFile").mockResolvedValue(null);
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    fireEvent.click(await screen.findByRole("button", { name: "Review a replay file…" }));

    await waitFor(() => expect(host.openBinaryFile).toHaveBeenCalledTimes(1));
    expect(importReviewBytesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Last game" })).toBeNull();
  });

  it("Retry on a non-manual error review calls retryReview()", async () => {
    await writeKey(LAST_REVIEW, okReview({ status: "error", error: "network fail", manual: false }));
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Last game/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    expect(retryReviewMock).toHaveBeenCalledTimes(1);
  });

  it("Retry on a manual error review re-opens the file dialog instead of calling retryReview()", async () => {
    vi.spyOn(host, "openBinaryFile").mockResolvedValue(null);
    await writeKey(LAST_REVIEW, okReview({ status: "error", error: "network fail", manual: true }));
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Last game/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => expect(host.openBinaryFile).toHaveBeenCalledTimes(1));
    expect(retryReviewMock).not.toHaveBeenCalled();
  });

  it("resolving 'which one are you' calls resolveReview with the chosen id and remembered name", async () => {
    await writeKey(LAST_REVIEW, okReview({ meStatus: "unresolved", meId: null }));
    render(<ReviewLauncher apiBase="https://warcraft-gym.com" />);

    fireEvent.click(await screen.findByRole("button", { name: /Last game/ }));
    fireEvent.click(await screen.findByRole("radio", { name: "Foe#2222 · Undead" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));

    expect(resolveReviewMock).toHaveBeenCalledTimes(1);
    const [review, meId, remembered] = resolveReviewMock.mock.calls[0];
    expect(review.id).toBe("r1");
    expect(meId).toBe(2);
    expect(remembered).toBe("Foe#2222");
  });
});
