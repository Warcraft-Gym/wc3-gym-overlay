/** Formats an ISO timestamp relative to `now` as "2 minutes ago", etc. */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown time";

  const diffMs = then - now;
  const absMs = Math.abs(diffMs);
  if (absMs < 60_000) return "just now";

  for (const [unit, unitMs] of UNITS) {
    if (absMs >= unitMs) {
      return formatter.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return "just now";
}
