/**
 * F004 — `parseMatchRef`/`fetchW3ChampionsReplay`: turning a pasted
 * W3Champions match link (or bare id) into replay bytes the existing
 * `parseReplay` pipeline already knows how to read. Kept dependency-free
 * from `w3gjs` itself (see the module's own docblock) — only the last test
 * below reaches into `parseReplay` to prove the fetched fixture bytes are a
 * real, parseable replay.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fetchW3ChampionsReplay, parseMatchRef, W3C_API, W3ChampionsError } from "./w3champions";

const MATCH_ID = "6aae9d48d867fad24f911778";

const FIXTURE_BYTES = new Uint8Array(
  readFileSync(join(__dirname, "__fixtures__/w3c_6aae9d48d867fad24f911778_last_refuge.w3g")),
);

const MATCH_JSON = {
  match: {
    map: "3c2609191153LastRefugev1_5",
    gameMode: 1,
    durationInSeconds: 813,
    teams: [
      { players: [{ battleTag: "Dretwiak#2963", race: 1, won: true }] },
      { players: [{ battleTag: "SoulKeeper#1844", race: 0, won: false }] },
    ],
  },
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.reject(new Error("not used")),
  } as unknown as Response;
}

function replayResponse(bytes: Uint8Array, ok = true, status = 200): Response {
  return {
    ok,
    status,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    json: () => Promise.reject(new Error("not used")),
  } as unknown as Response;
}

describe("parseMatchRef", () => {
  it.each([
    [`https://w3champions.com/match/${MATCH_ID}`, MATCH_ID],
    [`https://www.w3champions.com/match/${MATCH_ID}`, MATCH_ID],
    [`http://w3champions.com/match/${MATCH_ID}/`, MATCH_ID],
    [`w3champions.com/match/${MATCH_ID}`, MATCH_ID],
    [MATCH_ID, MATCH_ID],
    [MATCH_ID.toUpperCase(), MATCH_ID],
    [`  https://w3champions.com/match/${MATCH_ID}?x=1  `, MATCH_ID],
  ])("accepts %s", (input, expected) => {
    expect(parseMatchRef(input)).toBe(expected);
  });

  it.each([[""], ["https://example.com/x"], ["6aae9d48"], ["not a link at all"]])("rejects %s", (input) => {
    expect(parseMatchRef(input)).toBeNull();
  });
});

describe("fetchW3ChampionsReplay", () => {
  it("fetches the replay bytes from the exact API URL and maps the match JSON", async () => {
    const fetchImpl = vi.fn((url: string) => {
      if (url === `${W3C_API}/api/replays/${MATCH_ID}`) return Promise.resolve(replayResponse(FIXTURE_BYTES));
      if (url === `${W3C_API}/api/matches/${MATCH_ID}`) return Promise.resolve(jsonResponse(MATCH_JSON));
      throw new Error(`unexpected url ${url}`);
    });

    const result = await fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledWith(`${W3C_API}/api/replays/${MATCH_ID}`, expect.anything());
    expect(result.bytes.length).toBe(FIXTURE_BYTES.length);
    expect(result.fileName).toBe(`${MATCH_ID}.w3g`);
    expect(result.match).toEqual({
      map: "3c2609191153LastRefugev1_5",
      durationSeconds: 813,
      players: [
        { battleTag: "Dretwiak#2963", race: "human", won: true },
        { battleTag: "SoulKeeper#1844", race: "random", won: false },
      ],
    });
  });

  it("still resolves the replay when the match JSON fetch fails (best-effort)", async () => {
    const fetchImpl = vi.fn((url: string) => {
      if (url.includes("/api/replays/")) return Promise.resolve(replayResponse(FIXTURE_BYTES));
      return Promise.reject(new Error("match endpoint down"));
    });

    const result = await fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.bytes.length).toBe(FIXTURE_BYTES.length);
    expect(result.match).toBeUndefined();
  });

  it("throws not_found on a 404", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(replayResponse(new Uint8Array(), false, 404)));
    await expect(
      fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("throws bad_response on a non-404 non-2xx status", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(replayResponse(new Uint8Array(), false, 500)));
    await expect(
      fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "bad_response" });
  });

  it("throws bad_response when the body isn't a replay", async () => {
    const bytes = new TextEncoder().encode("hello");
    const fetchImpl = vi.fn(() => Promise.resolve(replayResponse(bytes)));
    await expect(
      fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "bad_response" });
  });

  it("throws unreachable when the fetch itself rejects", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("network down")));
    await expect(
      fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "unreachable" });
  });

  it("throws unreachable when the fetch aborts (timeout)", async () => {
    const fetchImpl = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }),
    );
    await expect(
      fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: "unreachable" });
  });

  it("every rejection is a W3ChampionsError", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("boom")));
    try {
      await fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch });
      throw new Error("expected fetchW3ChampionsReplay to reject");
    } catch (err) {
      expect(err).toBeInstanceOf(W3ChampionsError);
    }
  });

  it(
    "fetches the real fixture replay and it parses (race enum matches the parsed replay)",
    async () => {
      const fetchImpl = vi.fn((url: string) => {
        if (url === `${W3C_API}/api/replays/${MATCH_ID}`) return Promise.resolve(replayResponse(FIXTURE_BYTES));
        return Promise.resolve(jsonResponse(MATCH_JSON));
      });
      const { bytes } = await fetchW3ChampionsReplay(MATCH_ID, { fetchImpl: fetchImpl as unknown as typeof fetch });
      const { parseReplay } = await import("./parseReplay");
      const summary = await parseReplay(bytes);
      expect(summary.version).toBe("3.00");
      expect(summary.map.file).toContain("LastRefuge");
      expect(summary.durationMs).toBeGreaterThan(780_000);
      expect(summary.durationMs).toBeLessThan(784_000);
      const dretwiak = summary.players.find((p) => p.name === "Dretwiak#2963");
      const soulkeeper = summary.players.find((p) => p.name === "SoulKeeper#1844");
      expect(dretwiak?.raceDetected).toBe("human");
      expect(soulkeeper?.raceDetected).toBe("undead");
    },
    // F003: parsing a real ~190 KB replay under full-suite load (idMap's own
    // fixture-derived test above already takes 5s+) occasionally exceeds
    // vitest's default 5s test timeout — bump this one test rather than the
    // suite-wide default.
    20_000,
  );
});
