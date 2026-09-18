import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/cn";

export type ButtonVariant = "gold" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  gold: "btn-gold disabled:opacity-40 disabled:pointer-events-none",
  ghost:
    "border border-line bg-surface-2/60 text-fg hover:border-gold/50 hover:text-gold active:bg-surface-3 disabled:opacity-40",
  danger: "border border-loss/50 bg-surface-2/60 text-loss hover:bg-loss/10 disabled:opacity-40",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.65rem]",
  md: "h-9 px-4 text-[0.72rem]",
  lg: "h-11 px-6 text-[0.8rem]",
};

/**
 * Primary interactive control, ported from the site's `Button`
 * (`src/components/ui/Button.tsx`) — `gold` (`btn-gold`) for the one
 * dominant action per view, `ghost` for everything secondary, uppercase
 * serif label matching the site's CTA typography.
 */
export function Button({
  variant = "ghost",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded font-display font-bold uppercase tracking-[0.14em] transition-[filter,background-color,border-color,color,box-shadow,transform] duration-[var(--wg-dur-fast)] ease-[var(--ease-out-expo)] disabled:cursor-not-allowed",
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
