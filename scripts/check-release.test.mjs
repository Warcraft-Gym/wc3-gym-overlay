import { describe, expect, it } from "vitest";

import { isPrereleaseTag, runChecks, versionFromTag } from "./check-release.mjs";

/** Builds a `fetch`-shaped mock that resolves to `body` as JSON, for the
 *  one latest.json download every path makes. */
function jsonFetch(body) {
  return async () => ({ json: async () => body });
}

function makeLatestJson({ version = "0.6.0-beta.1", withSignatures = true } = {}) {
  const sig = withSignatures ? "sig" : "";
  return {
    version,
    platforms: {
      "windows-x86_64": {
        url: "https://api.github.com/repos/Warcraft-Gym/wc3-gym-overlay/releases/assets/1",
        signature: sig,
      },
      "darwin-universal": {
        url: "https://api.github.com/repos/Warcraft-Gym/wc3-gym-overlay/releases/assets/2",
        signature: sig,
      },
    },
  };
}

function collectLog() {
  const lines = [];
  return { log: (line) => lines.push(line), lines };
}

describe("isPrereleaseTag / versionFromTag", () => {
  it("treats a plain version as stable", () => {
    expect(isPrereleaseTag("overlay-v0.5.1")).toBe(false);
  });

  it("treats a -beta.N version as a prerelease", () => {
    expect(isPrereleaseTag("overlay-v0.6.0-beta.1")).toBe(true);
  });

  it("treats a -rc.N version as a prerelease", () => {
    expect(isPrereleaseTag("overlay-v0.6.0-rc.2")).toBe(true);
  });

  it("strips the overlay-v prefix", () => {
    expect(versionFromTag("overlay-v0.6.0-beta.1")).toBe("0.6.0-beta.1");
  });
});

describe("runChecks – prerelease tag", () => {
  const tag = "overlay-v0.6.0-beta.1";
  const assets = [{ name: "latest.json", browser_download_url: "https://example.com/latest.json" }];

  function ghApiFor({ releaseOverrides = {}, latestOverrides = {} } = {}) {
    return (path) => {
      if (path === "repos/Warcraft-Gym/wc3-gym-overlay/releases/tags/overlay-v0.6.0-beta.1") {
        return { id: 111, prerelease: true, draft: false, assets, ...releaseOverrides };
      }
      if (path === "repos/Warcraft-Gym/wc3-gym-overlay/releases/latest") {
        return { id: 222, tag_name: "overlay-v0.5.1", ...latestOverrides };
      }
      throw new Error(`unexpected ghApi path: ${path}`);
    };
  }

  it("passes when the release is a correctly-shaped prerelease", async () => {
    const { log, lines } = collectLog();
    const failed = await runChecks(tag, {
      ghApi: ghApiFor(),
      fetchFn: jsonFetch(makeLatestJson()),
      log,
    });
    expect(failed).toBe(false);
    expect(lines.some((l) => l.startsWith("FAIL"))).toBe(false);
  });

  it("fails when the release isn't marked prerelease", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor({ releaseOverrides: { prerelease: false } }),
      fetchFn: jsonFetch(makeLatestJson()),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when the release is a draft", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor({ releaseOverrides: { draft: true } }),
      fetchFn: jsonFetch(makeLatestJson()),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when the release is the one GET /releases/latest returns", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor({ latestOverrides: { id: 111, tag_name: tag } }),
      fetchFn: jsonFetch(makeLatestJson()),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when /releases/latest resolves to another prerelease, not a stable tag", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor({ latestOverrides: { id: 333, tag_name: "overlay-v0.6.0-beta.0" } }),
      fetchFn: jsonFetch(makeLatestJson()),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when latest.json's version doesn't match the tag", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor(),
      fetchFn: jsonFetch(makeLatestJson({ version: "0.6.0-beta.2" })),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when a platform signature is missing", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor(),
      fetchFn: jsonFetch(makeLatestJson({ withSignatures: false })),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when the release itself doesn't exist", async () => {
    const failed = await runChecks(tag, {
      ghApi: () => {
        throw new Error("404");
      },
      fetchFn: jsonFetch(makeLatestJson()),
      log: () => {},
    });
    expect(failed).toBe(true);
  });
});

describe("runChecks – stable tag", () => {
  const tag = "overlay-v0.5.1";
  const stableAssets = [
    {
      name: "Warcraft-3-Gym-Overlay-Portable.exe",
      browser_download_url: "https://example.com/Warcraft-3-Gym-Overlay-Portable.exe",
    },
    {
      name: "Warcraft-3-Gym-Overlay-Setup.exe",
      browser_download_url: "https://example.com/Warcraft-3-Gym-Overlay-Setup.exe",
    },
    { name: "latest.json", browser_download_url: "https://example.com/latest.json" },
  ];

  function ghApiFor(overrides = {}) {
    return (path) => {
      if (path === "repos/Warcraft-Gym/wc3-gym-overlay/releases/tags/overlay-v0.5.1") {
        return { id: 1, assets: stableAssets, ...overrides };
      }
      // windows-x86_64 / darwin-universal asset-name resolution lookups
      if (path.endsWith("/releases/assets/1")) {
        return { name: "Warcraft.3.Gym.Overlay_0.5.1_x64-setup.exe" };
      }
      if (path.endsWith("/releases/assets/2")) {
        return { name: "Warcraft.3.Gym.Overlay_0.5.1_universal.app.tar.gz" };
      }
      throw new Error(`unexpected ghApi path: ${path}`);
    };
  }

  function fetchFor(manifest) {
    return async (url, opts) => {
      if (url === "https://example.com/latest.json") {
        return { json: async () => manifest };
      }
      // Downloadability checks (HEAD for browser URLs, ranged GET for API URLs).
      if (opts?.method === "GET") {
        return { status: 200 };
      }
      return { status: 200 };
    };
  }

  it("passes for a correctly-shaped stable release (unchanged behaviour)", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor(),
      fetchFn: fetchFor(makeLatestJson({ version: "0.5.1" })),
      log: () => {},
    });
    expect(failed).toBe(false);
  });

  it("fails when a required stable-named asset is missing", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor({ assets: stableAssets.filter((a) => a.name !== "Warcraft-3-Gym-Overlay-Setup.exe") }),
      fetchFn: fetchFor(makeLatestJson({ version: "0.5.1" })),
      log: () => {},
    });
    expect(failed).toBe(true);
  });

  it("fails when latest.json's version doesn't match the tag", async () => {
    const failed = await runChecks(tag, {
      ghApi: ghApiFor(),
      fetchFn: fetchFor(makeLatestJson({ version: "0.5.0" })),
      log: () => {},
    });
    expect(failed).toBe(true);
  });
});
