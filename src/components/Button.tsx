import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "gold" | "ghost" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  gold:
    "bg-gold text-bg font-bold hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:hover:brightness-100",
  ghost:
    "border border-line bg-surface-2/60 text-fg hover:border-gold/50 hover:text-gold active:bg-surface-3 disabled:opacity-40",
  danger: "border border-loss/50 bg-surface-2/60 text-loss hover:bg-loss/10 disabled:opacity-40",
};

/** Primary interactive control. `gold` for the one dominant action per view,
 *  `ghost` for everything secondary. */
export function Button({
  variant = "ghost",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-[filter,background-color,border-color,color] duration-[var(--wg-dur-fast)] ease-[var(--ease-out-expo)] disabled:cursor-not-allowed",
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
