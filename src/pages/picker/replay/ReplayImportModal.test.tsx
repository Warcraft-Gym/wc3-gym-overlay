/**
 * F004 — `ReplayImportModal`, now backed entirely by the website's
 * `POST /api/replay-import` (no local `.w3g` parsing — `src/replay/` is
 * gone). Mocks `requestReplayImport` so these jsdom tests stay fast and
 * never touch the network; the real client is covered by
 * `src/api/replayImport.test.ts`.
 */
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayImportError, replayImportResponseSchema, type ReplayImportResponse } from "../../../api/replayImport";
// F004c — captured live from production (`https://warcraft-gym.com`) on
// 2026-09-30, `POST /api/replay-import` for `ced_vs_lyn.w3g`. Same fixture
// `src/api/replayImport.test.ts` parses — used here to feed a real response
// shape (array `tags`, etc.) through the whole modal, not just the schema.
import PRODUCTION_FIXTURE from "../../../api/__fixtures__/replay-import.production.json";

const requestReplayImportMock = vi.hoisted(() => vi.fn());
vi.mock("../../../api/replayImport", async () => {
  const actual = await vi.importActual<typeof import("../../../api/replayImport")>("../../../api/replayImport");
  return { ...actual, requestReplayImport: requestReplayImportMock };
});

const { ReplayImportModal } = await import("./ReplayImportModal");

const PRODUCTION_RESPONSE: ReplayImportResponse = replayImportResponseSchema.parse(PRODUCTION_FIXTURE);

const RESPONSE: ReplayImportResponse = {
  map: "Northern Isles",
  duration: "13:43",
  version: "3.00",
  source: { label: "Local file" },
  players: [
    {
      id: 0,
      name: "noname#114787",
      race: "human",
      dropped: 2,
      build: {
        title: "noname#114787 (Human) vs Orc — Northern Isles",
        race: "human",
        vsRaces: ["orc"],
        difficulty: "intermediate",
        patch: "",
        tags: ["replay"],
        summary: "Imported from replay Northern Isles (v3.00, 13:43).",
        author: "Replay Import",
        authorDiscord: "",
        sourceUrl: "",
        description: "",
        steps: [
          { time: "0:00", supply: 5, instruction: "Train peasant", icon: "" },
          { time: "0:20", supply: 6, instruction: "Build farm", icon: "" },
        ],
      },
    },
    {
      id: 1,
      name: "FoCuS#31324",
      race: "orc",
      dropped: 0,
      build: {
        title: "FoCuS#31324 (Orc) vs Human — Northern Isles",
        race: "orc",
        vsRaces: ["human"],
        difficulty: "intermediate",
        patch: "",
        tags: ["replay"],
        summary: "Imported from replay Northern Isles (v3.00, 13:43).",
        author: "Replay Import",
        authorDiscord: "",
        sourceUrl: "",
        description: "",
        steps: [{ time: "0:00", supply: 5, instruction: "Train peon", icon: "" }],
      },
    },
  ],
};

// F004b: a second, distinguishable response used by the superseded-request
// test below — only its map name matters for the assertions.
const SECOND_RESPONSE: ReplayImportResponse = {
  ...RESPONSE,
  map: "Echo Isles",
};

function renderModal(overrides: { onOpenInEditor?: (draft: unknown) => void; onClose?: () => void } = {}) {
  return render(
    <ReplayImportModal
      source={{ kind: "file", bytes: new Uint8Array([1, 2, 3]), fileName: "game.w3g" }}
      apiBase="https://site.test"
      onClose={overrides.onClose ?? vi.fn()}
      onOpenInEditor={overrides.onOpenInEditor ?? vi.fn()}
    />,
  );
}

function renderLinkModal(overrides: { onOpenInEditor?: (draft: unknown) => void; onClose?: () => void } = {}) {
  return render(
    <ReplayImportModal
      source={{ kind: "link" }}
      apiBase="https://site.test"
      onClose={overrides.onClose ?? vi.fn()}
      onOpenInEditor={overrides.onOpenInEditor ?? vi.fn()}
    />,
  );
}

describe("ReplayImportModal — file import", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("POSTs the file to {apiBase}/api/replay-import via requestReplayImport, using the configured apiBase", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();

    expect(screen.getByRole("status").textContent).toContain("Reading replay…");

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [apiBase, payload, opts] = requestReplayImportMock.mock.calls[0];
    expect(apiBase).toBe("https://site.test");
    expect(payload).toEqual({ kind: "file", bytes: new Uint8Array([1, 2, 3]), fileName: "game.w3g" });
    // F004a: defaults — 8:00 cutoff, upgrades on, items off — sent on first load.
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: false, signal: expect.any(AbortSignal) });
  });

  it("lists the response's players, with the first one selected by default", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();

    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());

    const humanRadio = screen.getByRole("radio", { name: "noname#114787 · Human" }) as HTMLInputElement;
    const orcRadio = screen.getByRole("radio", { name: "FoCuS#31324 · Orc" }) as HTMLInputElement;
    expect(humanRadio.checked).toBe(true);
    expect(orcRadio.checked).toBe(false);
    expect(screen.getByText("Northern Isles · v3.00 · 13:43")).toBeTruthy();
    expect(screen.getByText("Local file")).toBeTruthy();
  });

  it("choosing a player opens the editor with that player's build.steps", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    const onOpenInEditor = vi.fn();
    renderModal({ onOpenInEditor });
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    fireEvent.click(screen.getByRole("radio", { name: "FoCuS#31324 · Orc" }));
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));

    expect(onOpenInEditor).toHaveBeenCalledTimes(1);
    const draft = onOpenInEditor.mock.calls[0][0];
    expect(draft.title).toBe(RESPONSE.players[1].build.title);
    expect(draft.steps).toEqual([
      { time: "0:00", supply: "5", instruction: "Train peon", icon: "", importNote: undefined },
    ]);
  });

  it("shows the step count, and the dropped count for the selected player", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const preview = screen.getByText(/steps/);
    expect(preview.textContent).toBe("2 steps · 2 dropped");
    expect(preview.getAttribute("data-dropped-count")).toBe("2");

    fireEvent.click(screen.getByRole("radio", { name: "FoCuS#31324 · Orc" }));
    await waitFor(() => expect(screen.getByText(/steps/).textContent).toBe("1 steps"));
  });

  it("toggling 'Drop orders the game likely rejected' re-requests with dropLikelyRejected", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const checkbox = screen.getByRole("checkbox", {
      name: "Drop orders the game likely rejected",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    requestReplayImportMock.mockClear();
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    fireEvent.click(checkbox);

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [, , opts] = requestReplayImportMock.mock.calls[0];
    expect(opts).toEqual({ dropLikelyRejected: false, cutoffSeconds: 480, includeUpgrades: true, includeItems: false, signal: expect.any(AbortSignal) });
  });

  it("toggling 'Include upgrades' re-requests with includeUpgrades: false", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const checkbox = screen.getByRole("checkbox", { name: "Include upgrades" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    requestReplayImportMock.mockClear();
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    fireEvent.click(checkbox);

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [, , opts] = requestReplayImportMock.mock.calls[0];
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: false, includeItems: false, signal: expect.any(AbortSignal) });
  });

  it("toggling 'Include items' re-requests with includeItems: true", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const checkbox = screen.getByRole("checkbox", { name: "Include items" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    requestReplayImportMock.mockClear();
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    fireEvent.click(checkbox);

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [, , opts] = requestReplayImportMock.mock.calls[0];
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: true, signal: expect.any(AbortSignal) });
  });

  it("shows the cutoff field defaulted to 08:00, and applies a new value on blur, re-requesting with cutoffSeconds", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    const cutoff = screen.getByRole("textbox", { name: "Import up to" }) as HTMLInputElement;
    expect(cutoff.value).toBe("08:00");

    requestReplayImportMock.mockClear();
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    fireEvent.change(cutoff, { target: { value: "2:00" } });
    fireEvent.blur(cutoff);

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [, , opts] = requestReplayImportMock.mock.calls[0];
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 120, includeUpgrades: true, includeItems: false, signal: expect.any(AbortSignal) });
    expect(cutoff.value).toBe("02:00");
  });

  it("applies the cutoff field on Enter, not on every keystroke", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    requestReplayImportMock.mockClear();
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    const cutoff = screen.getByRole("textbox", { name: "Import up to" }) as HTMLInputElement;
    fireEvent.change(cutoff, { target: { value: "3" } });
    fireEvent.change(cutoff, { target: { value: "3:" } });
    fireEvent.change(cutoff, { target: { value: "3:0" } });
    expect(requestReplayImportMock).not.toHaveBeenCalled();

    fireEvent.change(cutoff, { target: { value: "3:00" } });
    fireEvent.keyDown(cutoff, { key: "Enter" });

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [, , opts] = requestReplayImportMock.mock.calls[0];
    expect(opts).toMatchObject({ cutoffSeconds: 180 });
  });

  it("an invalid cutoff shows an inline error and makes no request", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderModal();
    await waitFor(() => screen.getByRole("radiogroup", { name: "Player" }));

    requestReplayImportMock.mockClear();
    const cutoff = screen.getByRole("textbox", { name: "Import up to" }) as HTMLInputElement;
    fireEvent.change(cutoff, { target: { value: "not a time" } });
    fireEvent.blur(cutoff);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Enter a time as m:ss");
    expect(requestReplayImportMock).not.toHaveBeenCalled();
  });

  it("a 400 about cutoffSeconds shows the server's text", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    requestReplayImportMock.mockRejectedValue(
      new ReplayImportError("http", "cutoffSeconds must be an integer between 1 and 3600.", { status: 400 }),
    );
    renderModal();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("cutoffSeconds must be an integer between 1 and 3600.");
    consoleError.mockRestore();
  });

  it.each([
    ["network", "Couldn't reach site.test. Check your connection."],
    ["http", "The build was rejected (400)."],
    ["rate_limited", "Too many imports in a minute, try again shortly."],
    ["invalid", "The server sent back something that wasn't a valid reply."],
  ] as const)("shows the ReplayImportError message for kind %s", async (kind, message) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    requestReplayImportMock.mockRejectedValue(new ReplayImportError(kind, message));
    renderModal();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(message);
    expect((screen.getByRole("button", { name: "Open in editor" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false);
    consoleError.mockRestore();
  });

  it("shows a generic message and logs to console for an unexpected (non-ReplayImportError) rejection", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    requestReplayImportMock.mockRejectedValue(new Error("boom"));
    renderModal();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't read this replay.");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("ReplayImportModal — W3Champions link import (F004)", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("shows a labelled link input and a Fetch button, with no player content and no request yet", () => {
    renderLinkModal();

    expect(screen.getByRole("textbox", { name: "W3Champions match link or id" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fetch" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: "Player" })).toBeNull();
    expect(requestReplayImportMock).not.toHaveBeenCalled();
  });

  it("shows an inline error and makes no request when the input is blank", async () => {
    renderLinkModal();
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Paste a W3Champions match link or id.");
    expect(requestReplayImportMock).not.toHaveBeenCalled();
  });

  it("Fetch POSTs JSON {match} via requestReplayImport, using the configured apiBase", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderLinkModal();

    fireEvent.change(screen.getByRole("textbox", { name: "W3Champions match link or id" }), {
      target: { value: "https://w3champions.com/match/6aae9d48d867fad24f911778" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
    const [apiBase, payload, opts] = requestReplayImportMock.mock.calls[0];
    expect(apiBase).toBe("https://site.test");
    expect(payload).toEqual({ kind: "match", match: "https://w3champions.com/match/6aae9d48d867fad24f911778" });
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: false, signal: expect.any(AbortSignal) });

    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());
  });

  it("Enter in the input triggers Fetch", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);
    renderLinkModal();

    const input = screen.getByRole("textbox", { name: "W3Champions match link or id" });
    fireEvent.change(input, { target: { value: "6aae9d48d867fad24f911778" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(requestReplayImportMock).toHaveBeenCalledTimes(1));
  });

  it("shows a fetching status and disables Fetch while the request is in flight", async () => {
    let resolveRequest: (value: ReplayImportResponse) => void = () => {};
    requestReplayImportMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    renderLinkModal();
    fireEvent.change(screen.getByRole("textbox", { name: "W3Champions match link or id" }), {
      target: { value: "6aae9d48d867fad24f911778" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Fetching replay from W3Champions…"));
    expect((screen.getByRole("button", { name: "Fetch" }) as HTMLButtonElement).disabled).toBe(true);

    resolveRequest(RESPONSE);
    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());
  });

  it("a rejected request shows the server's error inline and keeps the input editable for a retry", async () => {
    requestReplayImportMock.mockRejectedValue(new ReplayImportError("http", "Match not found on W3Champions."));

    renderLinkModal();
    fireEvent.change(screen.getByRole("textbox", { name: "W3Champions match link or id" }), {
      target: { value: "6aae9d48d867fad24f911778" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Match not found on W3Champions.");
    expect(screen.getByRole("textbox", { name: "W3Champions match link or id" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fetch" })).toBeTruthy();
  });
});

describe("ReplayImportModal — React StrictMode (F004b)", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  it("leaves 'Reading replay…' and shows the player list after StrictMode's simulated mount/unmount/remount", async () => {
    requestReplayImportMock.mockResolvedValue(RESPONSE);

    render(
      <StrictMode>
        <ReplayImportModal
          source={{ kind: "file", bytes: new Uint8Array([1, 2, 3]), fileName: "game.w3g" }}
          apiBase="https://site.test"
          onClose={vi.fn()}
          onOpenInEditor={vi.fn()}
        />
      </StrictMode>,
    );

    // Pre-fix: mountedRef.current is flipped to false by StrictMode's
    // simulated unmount and never reset, so every response (including the
    // one from the second, "real" mount) is dropped and the modal is stuck
    // here forever.
    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("aborts the request superseded by StrictMode's remount, and only the newest response is ever applied", async () => {
    // F004b: the modal's own option controls (checkboxes, cutoff field) only
    // render once a request has *settled* into `{ kind: "ready" }` — while
    // one is in flight the modal shows only "Reading replay…", nothing
    // interactive. So the one place two requests for the same modal
    // instance are ever genuinely in flight at once — the race this test
    // guards — is exactly the StrictMode mount/unmount/remount this
    // feature fixes (also the source of the bug report's "two
    // near-simultaneous POSTs per upload"): the first (simulated) mount's
    // request must be aborted by its cleanup, and even if it still manages
    // to resolve afterwards (racy in real life, but exercised here to prove
    // the `cancelled` guard — not just the abort — holds), its response
    // must never reach the screen; only the second, "real" mount's
    // response may.
    type PendingEntry = { resolve: (data: ReplayImportResponse) => void; aborted: boolean };
    const pending: PendingEntry[] = [];
    requestReplayImportMock.mockImplementation(
      (_apiBase: string, _payload: unknown, opts: { signal?: AbortSignal } = {}) => {
        const entry: PendingEntry = { resolve: () => {}, aborted: false };
        const promise = new Promise<ReplayImportResponse>((resolve, reject) => {
          entry.resolve = resolve;
          opts.signal?.addEventListener("abort", () => {
            entry.aborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
        pending.push(entry);
        return promise;
      },
    );

    render(
      <StrictMode>
        <ReplayImportModal
          source={{ kind: "file", bytes: new Uint8Array([1, 2, 3]), fileName: "game.w3g" }}
          apiBase="https://site.test"
          onClose={vi.fn()}
          onOpenInEditor={vi.fn()}
        />
      </StrictMode>,
    );

    // Two requests went out (the StrictMode-doubled POSTs from the bug
    // report); exactly one is still live, the other already aborted by its
    // effect's cleanup.
    await waitFor(() => expect(pending.length).toBe(2));
    const superseded = pending.find((entry) => entry.aborted);
    const live = pending.find((entry) => !entry.aborted);
    expect(superseded).toBeTruthy();
    expect(live).toBeTruthy();

    // The live one resolves first and is applied.
    live!.resolve(SECOND_RESPONSE);
    await waitFor(() => expect(screen.getByText("Echo Isles · v3.00 · 13:43")).toBeTruthy());

    // The superseded one resolves late, with different data — it must not
    // override what's already on screen.
    superseded!.resolve(RESPONSE);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByText("Echo Isles · v3.00 · 13:43")).toBeTruthy();
    expect(screen.queryByText("Northern Isles · v3.00 · 13:43")).toBeNull();
  });
});

describe("ReplayImportModal — real production response shape, under StrictMode (F004c)", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.clearAllMocks();
  });

  // End-to-end from the mocked request through to `onOpenInEditor`, fed the
  // fixture captured live from production (array `tags`, not the
  // hand-written mocks' shape) and rendered inside `<StrictMode>` — the same
  // combination the F004b/F004c bugs both hid from the unit tests.
  it("lists both of the fixture's players, and opening one in the editor passes the real shape through replayBuildToFormInput", async () => {
    requestReplayImportMock.mockResolvedValue(PRODUCTION_RESPONSE);
    const onOpenInEditor = vi.fn();

    render(
      <StrictMode>
        <ReplayImportModal
          source={{ kind: "file", bytes: new Uint8Array([1, 2, 3]), fileName: "ced_vs_lyn.w3g" }}
          apiBase="https://site.test"
          onClose={vi.fn()}
          onOpenInEditor={onOpenInEditor}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Player" })).toBeTruthy());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    const firstPlayer = PRODUCTION_RESPONSE.players[0];
    const secondPlayer = PRODUCTION_RESPONSE.players[1];
    const firstRadio = screen.getByRole("radio", { name: `${firstPlayer.name} · Orc` }) as HTMLInputElement;
    const secondRadio = screen.getByRole("radio", { name: `${secondPlayer.name} · Undead` }) as HTMLInputElement;
    expect(firstRadio.checked).toBe(true);
    expect(secondRadio.checked).toBe(false);

    fireEvent.click(secondRadio);
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));

    expect(onOpenInEditor).toHaveBeenCalledTimes(1);
    const draft = onOpenInEditor.mock.calls[0][0] as { tags: string; steps: unknown[] };
    // F004c: the wire's array `tags` joined the same way `fromBuild` does.
    expect(draft.tags).toBe(secondPlayer.build.tags.join(", "));
    expect(draft.steps).toEqual(
      secondPlayer.build.steps.map((step) => ({
        time: step.time,
        supply: String(step.supply),
        instruction: step.instruction,
        icon: step.icon,
        importNote: step.importNote,
      })),
    );
  });
});
