/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

function shimPath(relative: string): string {
  return new URL(relative, import.meta.url).pathname;
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // F002: w3gjs (replay parsing) is a Node-targeted library — it needs
  // Buffer/events/util/stream plus a handful of Node built-in shims to run
  // in the browser bundle. Vitest also runs on top of Vite's "serve"
  // command, so `command` alone can't distinguish it from `vite dev` —
  // Vitest additionally sets `mode: "test"` and `process.env.VITEST`,
  // which is what actually gates these aliases/polyfills off so F001's
  // replay tests keep exercising real Node `zlib`/`fs`.
  const isVitest = mode === "test" || process.env.VITEST === "true";
  const isBrowserTarget = !isVitest && (command === "build" || command === "serve");

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(isBrowserTarget
        ? [nodePolyfills({ include: ["buffer", "events", "util", "stream"], globals: { Buffer: true } })]
        : []),
    ],
    base: "./",
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
    },
    resolve: {
      alias: isBrowserTarget
        ? [
            { find: /^node:zlib$/, replacement: shimPath("./src/replay/shims/zlib.ts") },
            { find: /^zlib$/, replacement: shimPath("./src/replay/shims/zlib.ts") },
            { find: /^node:fs$/, replacement: shimPath("./src/replay/shims/fs.ts") },
            { find: /^fs$/, replacement: shimPath("./src/replay/shims/fs.ts") },
            { find: /^node:perf_hooks$/, replacement: shimPath("./src/replay/shims/perf_hooks.ts") },
            { find: /^node:crypto$/, replacement: shimPath("./src/replay/shims/crypto.ts") },
            { find: /^crypto$/, replacement: shimPath("./src/replay/shims/crypto.ts") },
            { find: /^node:console$/, replacement: shimPath("./src/replay/shims/console.ts") },
          ]
        : [],
    },
    build: {
      target: "es2021",
      rollupOptions: {
        input: {
          picker: "picker.html",
          overlay: "overlay.html",
        },
        output: {
          // F002: keep w3gjs + its deps + the polyfills + our replay code
          // out of the eager bundle — the picker/overlay chrome never needs
          // it until "Import replay" is actually clicked (see C-606).
          manualChunks(id: string) {
            if (
              id.includes("node_modules/w3gjs") ||
              id.includes("node_modules/protobufjs") ||
              id.includes("node_modules/fflate") ||
              id.includes("vite-plugin-node-polyfills") ||
              id.includes("/src/replay/")
            ) {
              return "replay";
            }
            return undefined;
          },
        },
      },
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    test: {
      environment: "jsdom",
    },
  };
});
