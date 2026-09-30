# wc3-gym-overlay

A small Tauri v2 + Vite + React desktop app (`wc3gym-overlay`) that shows a
Warcraft III build order in a transparent, always-on-top, borderless window
while you play: pick a build from a normal window, then toggle a floating
panel on top of the game with a global shortcut. It reads the public JSON
build API served by the [Warcraft 3 Gym website](https://wc3-gnl-website.vercel.app).

## Download

The overlay is distributed as signed installers from this repo's
[GitHub Releases](../../releases). The website's
[`/tools/overlay`](https://wc3-gnl-website.vercel.app/tools/overlay) page is
the public download/install page — it always links to the latest build,
with screenshots, shortcuts and prerequisites.

## Develop

```bash
pnpm install

# Native app (real Tauri windows)
pnpm tauri dev

# Browser mode (no Tauri windows — picker.html/overlay.html as tabs)
pnpm dev
```

## Test

```bash
pnpm test              # unit tests (vitest)
pnpm run typecheck     # tsc --noEmit
pnpm run lint          # eslint
pnpm run check:config  # validates tauri.conf.json + capabilities
```

## More

See [`docs/overlay.md`](docs/overlay.md) for install instructions,
prerequisites, replay import, troubleshooting, and the release process.
