import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** Labelled text input with an inline validation error slot. */
export function TextField({
  label,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null }) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={inputId} className="block text-xs">
      <span className="mb-1 block font-mono uppercase tracking-[0.14em] text-faint">{label}</span>
      <input
        id={inputId}
        className={cn(
          "h-9 w-full rounded border bg-surface-2/60 px-2.5 text-sm text-fg outline-none transition-colors placeholder:text-faint",
          error ? "border-loss" : "border-line focus:border-gold/60",
          className,
        )}
        aria-invalid={error ? "true" : undefined}
        {...props}
      />
      {error ? (
        <span role="alert" className="mt-1 block text-[0.7rem] text-loss">
          {error}
        </span>
      ) : null}
    </label>
  );
}
