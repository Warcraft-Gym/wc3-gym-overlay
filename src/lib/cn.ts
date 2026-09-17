/** Joins class name fragments, dropping falsy values. No merge/precedence
 *  logic — the overlay's class lists never conflict, so plain `clsx` (not
 *  `tailwind-merge`) is all that's needed and it avoids another dependency. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
