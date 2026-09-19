/**
 * Turns a raw map identifier into a readable display name. Handles both
 * shapes seen in the wild:
 *  - the internal replay map path, underscore-delimited, with a trailing
 *    `_vX.Y` version tag and a `.w3x`/`.w3m` extension (e.g.
 *    `3_w3c_260919_1153_LastRefuge_v1.5.w3x` -> "Last Refuge") — this is
 *    what `parseReplay.ts` feeds it for `ReplaySummary.map.name`;
 *  - the raw map key the W3Champions match API returns, with no separators
 *    at all and the version glued straight onto the name (e.g.
 *    `3c2609191153LastRefugev1_5` -> "Last Refuge") — this is what
 *    `ReplayImportModal`'s W3Champions caption feeds it (F004 follow-up).
 * Falls back to the input unchanged when neither shape is recognised.
 *
 * Deliberately dependency-free (no `w3gjs`, no other replay module) so
 * anything that only needs a display caption can import it without pulling
 * the heavy replay-parsing bundle into the same chunk (see C-606).
 */
export function humanizeMapName(raw: string): string {
  const withoutExt = raw.replace(/\.(w3x|w3m)$/i, "");
  const withoutVersion = withoutExt.replace(/_?v\d[\d._]*$/i, "");
  const segments = withoutVersion.split("_").filter(Boolean);
  const candidate = segments[segments.length - 1] ?? withoutVersion;
  const name = candidate.match(/[A-Z][a-zA-Z0-9]*$/)?.[0] ?? candidate;
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced.length > 0 ? spaced : raw;
}
