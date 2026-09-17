import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

/** Square icon-only control. Always requires an `aria-label` — there is no
 *  visible text fallback, so the accessible name comes entirely from it. */
export function IconButton({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; children: ReactNode; "aria-label": string }) {
  return (
    <button
      type="button"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded border transition-[border-color,color,background-color] duration-[var(--wg-dur-fast)] ease-[var(--ease-out-expo)]",
        active
          ? "border-gold bg-gold/10 text-gold"
          : "border-line bg-surface-2/60 text-muted hover:border-gold/50 hover:text-gold",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
