/**
 * Thin read/write wrapper over the `LOCAL_BUILDS` store key — the only
 * place that touches `localStorage` directly for private builds. Every
 * other consumer (the CRUD helpers in `lib/localBuilds.ts`, the editor in
 * F003) goes through these two functions plus `useStoreValue(LOCAL_BUILDS)`
 * for reactive reads.
 */

import { LOCAL_BUILDS, type LocalBuild } from "../store/keys";
import { readKey, writeKey } from "../store/state";

export function readLocalBuilds(): LocalBuild[] {
  return readKey(LOCAL_BUILDS);
}

export function writeLocalBuilds(builds: LocalBuild[]): Promise<void> {
  return writeKey(LOCAL_BUILDS, builds);
}
