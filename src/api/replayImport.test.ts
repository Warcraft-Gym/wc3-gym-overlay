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
  replayImportResponseSchema,
  replayImportStepSchema,
  requestReplayImport,
  type ReplayImportBuild,
} from "./replayImport";
// F004c — captured live from production (`https://warcraft-gym.com`) on
// 2026-09-30, `POST /api/replay-import` for `ced_vs_lyn.w3g`. Committed
// verbatim (pretty-printed) so the schema is checked against a real
// response, not a hand-written mock that can (and did) encode the same
// mistake as the code under test — see the F004c spec.
import PRODUCTION_FIXTURE from "./__fixtures__/replay-import.production.json";
// F010a – follow-up of F010 (review-ui): captured live from production on
// the fixture replay used site-wide (`last_refuge.w3g`, Dretwiak#2963
// (human) vs SoulKeeper#1844 (undead)), with exactly the options a review
// sends (`cutoffSeconds=900`, `includeUpgrades=true`, `includeItems=true`
// – see `reviews/pipeline.ts`'s `REVIEW_*` constants). Two of Dretwiak's
// steps are item purchases the icon catalogue doesn't cover ("Buy Circlet
// of Nobility", "Buy Boots of Speed") and arrive with no `icon` field at
// all – the real bug this feature fixes (every such review was rejected
// with "The server sent back something that wasn't a valid reply.").
import ALL_OPTIONS_FIXTURE from "./__fixtures__/replay-import.production.all-options.json";
import { z } from "zod";

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
        tags: ["replay"],
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
        tags: ["replay"],
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
    // F004a: cutoffSeconds/includeUpgrades/includeItems are sent explicitly
    // every time, using their defaults when the caller omits them.
    expect(form.get("cutoffSeconds")).toBe("480");
    expect(form.get("includeUpgrades")).toBe("true");
    expect(form.get("includeItems")).toBe("false");
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

  it("sends cutoffSeconds/includeUpgrades/includeItems as multipart strings with the caller's values", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "file", bytes: new Uint8Array([1]), fileName: "game.w3g" },
      { fetchImpl, cutoffSeconds: 120, includeUpgrades: false, includeItems: true },
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("cutoffSeconds")).toBe("120");
    expect(form.get("includeUpgrades")).toBe("false");
    expect(form.get("includeItems")).toBe("true");
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
      // F004a: sent explicitly every time, using their defaults here.
      cutoffSeconds: 480,
      includeUpgrades: true,
      includeItems: false,
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
      cutoffSeconds: 480,
      includeUpgrades: true,
      includeItems: false,
    });
  });

  it("sends cutoffSeconds/includeUpgrades/includeItems natively (not as strings) in the JSON body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, VALID_RESPONSE));

    await requestReplayImport(
      "https://warcraft-gym.com",
      { kind: "match", match: "6aaef285d867fad24f9135d5" },
      { fetchImpl, cutoffSeconds: 90, includeUpgrades: false, includeItems: true },
    );

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.cutoffSeconds).toBe(90);
    expect(body.includeUpgrades).toBe(false);
    expect(body.includeItems).toBe(true);
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
  it("adapts the wire shape (numeric supply, array tags) into EditorFormInput's all-string shape", () => {
    const build: ReplayImportBuild = VALID_RESPONSE.players[0].build;
    const form = replayBuildToFormInput(build);
    expect(form.title).toBe(build.title);
    expect(form.vsRaces).toEqual(build.vsRaces);
    // F004c: joins the wire's string array the same way `fromBuild` does
    // (`src/lib/buildEditorSchema.ts`: `tags: build.tags.join(", ")`).
    expect(form.tags).toBe("replay");
    expect(form.steps).toEqual([
      { time: "0:01", supply: "5", instruction: "Train 2× Peon", icon: "or-peon", importNote: undefined },
    ]);
  });

  it("joins multiple tags with ', '", () => {
    const build: ReplayImportBuild = { ...VALID_RESPONSE.players[0].build, tags: ["replay", "fast-expand"] };
    expect(replayBuildToFormInput(build).tags).toBe("replay, fast-expand");
  });
});

describe("replayImportResponseSchema — real production response (F004c)", () => {
  // Pre-fix, this fails: the schema declared `build.tags` as `z.string()`
  // but production sends an array (`["replay"]`) and always has — every
  // real import was rejected by `safeParse`. See the F004c spec for the
  // verified defect.
  it("parses the fixture captured live from production", () => {
    const result = replayImportResponseSchema.safeParse(PRODUCTION_FIXTURE);
    expect(result.success).toBe(true);
  });

  it("replayBuildToFormInput turns the fixture's players into valid EditorFormInput, joining tags with the fromBuild convention", () => {
    const parsed = replayImportResponseSchema.parse(PRODUCTION_FIXTURE);
    expect(parsed.players).toHaveLength(2);

    const first = replayBuildToFormInput(parsed.players[0].build);
    expect(first.tags).toBe("replay");
    expect(first.title).toBe(parsed.players[0].build.title);
    expect(first.steps).toHaveLength(parsed.players[0].build.steps.length);
    expect(first.steps[0]).toEqual({
      time: "0:01",
      supply: "5",
      instruction: "Train 2× Peon",
      icon: "or-peon",
      importNote: undefined,
    });

    const second = replayBuildToFormInput(parsed.players[1].build);
    expect(second.tags).toBe("replay");
  });
});

it("ReplayImportError carries kind/status/cause", () => {
  const err = new ReplayImportError("http", "boom", { status: 502, cause: "x" });
  expect(err.message).toBe("boom");
  expect(err.kind).toBe("http");
  expect(err.status).toBe(502);
  expect(err.cause).toBe("x");
});

describe("replayImportResponseSchema – real production response with every option on (F010a)", () => {
  // The old schema (`icon: z.string()`, required) rejected this exact
  // response – reconstructed inline (not imported) so this test keeps
  // demonstrating the pre-fix bug even after `replayImportStepSchema`
  // itself is fixed for good. Picked an actual item step straight off the
  // fixture (no `icon` field at all) rather than a hand-written mock.
  it("the pre-fix schema (icon required) rejects an item step the icon catalogue doesn't cover", () => {
    const oldStepSchema = z.object({
      time: z.string(),
      supply: z.number(),
      instruction: z.string(),
      icon: z.string(),
      importNote: z.string().optional(),
    });
    const itemStepWithNoIcon = ALL_OPTIONS_FIXTURE.players[0].build.steps.find(
      (step: { icon?: string }) => step.icon === undefined,
    );
    expect(itemStepWithNoIcon).toBeDefined();
    expect(oldStepSchema.safeParse(itemStepWithNoIcon).success).toBe(false);
    // The current (fixed) schema accepts the exact same step.
    expect(replayImportStepSchema.safeParse(itemStepWithNoIcon).success).toBe(true);
  });

  it("parses the full fixture with replayImportResponseSchema", () => {
    const result = replayImportResponseSchema.safeParse(ALL_OPTIONS_FIXTURE);
    expect(result.success).toBe(true);
  });

  it("replayBuildToFormInput accepts the fixture's icon-less steps, mapping the missing icon to ''", () => {
    const parsed = replayImportResponseSchema.parse(ALL_OPTIONS_FIXTURE);
    const dretwiak = replayBuildToFormInput(parsed.players[0].build);
    const circlet = dretwiak.steps.find((s) => s.instruction === "Buy Circlet of Nobility");
    const boots = dretwiak.steps.find((s) => s.instruction === "Buy Boots of Speed");
    expect(circlet?.icon).toBe("");
    expect(boots?.icon).toBe("");
    // Every other step kept its real icon – only the two untracked item
    // purchases are affected.
    expect(dretwiak.steps.filter((s) => s.icon === "")).toHaveLength(2);
  });
});
