/**
 * F004 — `ReplayImportModal`, now backed entirely by the website's
 * `POST /api/replay-import` (no local `.w3g` parsing — `src/replay/` is
 * gone). Mocks `requestReplayImport` so these jsdom tests stay fast and
 * never touch the network; the real client is covered by
 * `src/api/replayImport.test.ts`.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplayImportError, type ReplayImportResponse } from "../../../api/replayImport";

const requestReplayImportMock = vi.hoisted(() => vi.fn());
vi.mock("../../../api/replayImport", async () => {
  const actual = await vi.importActual<typeof import("../../../api/replayImport")>("../../../api/replayImport");
  return { ...actual, requestReplayImport: requestReplayImportMock };
});

const { ReplayImportModal } = await import("./ReplayImportModal");

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
        tags: "replay",
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
        tags: "replay",
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
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: false });
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
    expect(opts).toEqual({ dropLikelyRejected: false, cutoffSeconds: 480, includeUpgrades: true, includeItems: false });
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
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: false, includeItems: false });
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
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: true });
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
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 120, includeUpgrades: true, includeItems: false });
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
    expect(opts).toEqual({ dropLikelyRejected: true, cutoffSeconds: 480, includeUpgrades: true, includeItems: false });

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
