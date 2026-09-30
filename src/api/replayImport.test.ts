/**
 * F004 — `requestReplayImport` (the client for the website's
 * `POST /api/replay-import`, which replaced the overlay's own `.w3g`
 * parser) and `replayBuildToFormInput` (the wire-shape → `EditorFormInput`
 * adapter). Every network/HTTP/validation failure must surface as a typed
 * `ReplayImportError` with a message fit to show the user — see C-043.
 */
import { describe, expect, it, vi } from "vitest";
import {
  ReplayImportError,
  replayBuildToFormInput,
  requestReplayImport,
  type ReplayImportBuild,
} from "./replayImport";

const VALID_RESPONSE = {
  map: "Northern Isles",
  duration: "13:43",
  version: "1.36.1",
  source: { label: "Local file" },
  players: [
    {
      id: 0,
      name: "noname#114787",
      race: "human",
      dropped: 2,
      build: {
        title: "noname's Human build",
        race: "human",
        vsRaces: ["orc"],
        difficulty: "beginner",
        patch: "1.36",
        tags: "replay",
        summary: "Imported from a replay.",
        author: "noname#114787",
        authorDiscord: "",
        sourceUrl: "",
        description: "",
        steps: [{ time: "0:01", supply: 5, instruction: "Train 2× Peon", icon: "or-peon" }],
      },
    },
    {
      id: 1,
      name: "FoCuS#31324",
      race: "orc",
      dropped: 0,
      build: {
        title: "FoCuS's Orc build",
        race: "orc",
        vsRaces: ["human"],
        difficulty: "beginner",
        patch: "1.36",
        tags: "replay",
        summary: "Imported from a replay.",
        author: "FoCuS#31324",
        authorDiscord: "",
        sourceUrl: "",
        description: "",
        steps: [],
      },
    },
  ],
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function unparsableResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token")),
  } as unknown as Response;
}

describe("requestReplayImport — file import", () => {
  it("POSTs multipart/form-data with field `replay` (filename included) to {apiBase}/api/replay-import", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));
    const bytes = new Uint8Array([1, 2, 3]);

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "file", bytes, fileName: "game.w3g" },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://warcraft-gym.com/api/replay-import");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get("replay") as File;
    expect(file).toBeTruthy();
    expect(file.name).toBe("game.w3g");
    // dropLikelyRejected defaults to true (drop), which per the verified API
    // shape is the *absence* of the field, not an explicit "true".
    expect(form.has("dropLikelyRejected")).toBe(false);
  });

  it("sends dropLikelyRejected=false only when the caller explicitly asks to keep likely-rejected orders", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "file", bytes: new Uint8Array([1]), fileName: "game.w3g" },
      { fetchImpl, dropLikelyRejected: false },
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("dropLikelyRejected")).toBe("false");
  });

  it("validates and returns the 200 body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));
    const result = await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "file", bytes: new Uint8Array([1]), fileName: "game.w3g" },
      { fetchImpl },
    );
    expect(result.map).toBe("Northern Isles");
    expect(result.players).toHaveLength(2);
    expect(result.players[0].build.steps[0].instruction).toBe("Train 2× Peon");
  });
});

describe("requestReplayImport — W3Champions link import", () => {
  it("POSTs JSON {match} to {apiBase}/api/replay-import", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "match", match: "https://w3champions.com/match/6aaef285d867fad24f9135d5" },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://warcraft-gym.com/api/replay-import");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      match: "https://w3champions.com/match/6aaef285d867fad24f9135d5",
    });
  });

  it("includes dropLikelyRejected: false in the JSON body only when set", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "match", match: "6aaef285d867fad24f9135d5" },
      { fetchImpl, dropLikelyRejected: false },
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      match: "6aaef285d867fad24f9135d5",
      dropLikelyRejected: false,
    });
  });

  it("uses the configured apiBase, not a hardcoded host", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));
    await requestReplayImport(
      "http://localhost:3111",
      { kind: "match", match: "6aaef285d867fad24f9135d5" },
      { fetchImpl },
    );
    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3111/api/replay-import");
  });
});

describe("requestReplayImport — every failure is visible", () => {
  it("a thrown fetch (network/CORS failure) becomes a network ReplayImportError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      requestReplayImport(
        "https://warcraft-gym.com",
        { kind: "match", match: "x" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ReplayImportError",
      kind: "network",
      message: "Couldn't reach warcraft-gym.com. Check your connection.",
    });
  });

  it.each([400, 413, 422, 500, 502])("a %i with a JSON error shows the server's text", async (status) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(status, { error: `server said ${status}` }));
    await expect(
      requestReplayImport(
        "https://warcraft-gym.com",
        { kind: "match", match: "x" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ReplayImportError",
      kind: "http",
      status,
      message: `server said ${status}`,
    });
  });

  it("429 (rate limited, no guaranteed JSON body) shows a fixed message without requiring a body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(unparsableResponse(429));
    await expect(
      requestReplayImport(
        "https://warcraft-gym.com",
        { kind: "match", match: "x" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ReplayImportError",
      kind: "rate_limited",
      status: 429,
      message: "Too many imports in a minute, try again shortly.",
    });
  });

  it("a malformed 200 body (fails zod validation) shows a clear message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { nonsense: true }));
    await expect(
      requestReplayImport(
        "https://warcraft-gym.com",
        { kind: "match", match: "x" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ReplayImportError",
      kind: "invalid",
    });
  });

  it("a 200 whose body isn't valid JSON shows a clear message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(unparsableResponse(200));
    await expect(
      requestReplayImport(
        "https://warcraft-gym.com",
        { kind: "match", match: "x" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({
      name: "ReplayImportError",
      kind: "invalid",
    });
  });
});

describe("replayBuildToFormInput", () => {
  it("adapts the wire shape (numeric supply) into EditorFormInput's all-string steps", () => {
    const build: ReplayImportBuild = VALID_RESPONSE.players[0].build;
    const form = replayBuildToFormInput(build);
    expect(form.title).toBe(build.title);
    expect(form.vsRaces).toEqual(build.vsRaces);
    expect(form.steps).toEqual([
      { time: "0:01", supply: "5", instruction: "Train 2× Peon", icon: "or-peon", importNote: undefined },
    ]);
  });
});

it("ReplayImportError carries kind/status/cause", () => {
  const err = new ReplayImportError("http", "boom", { status: 502, cause: "x" });
  expect(err.message).toBe("boom");
  expect(err.kind).toBe("http");
  expect(err.status).toBe(502);
  expect(err.cause).toBe("x");
});
