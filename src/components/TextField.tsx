import { useId, type InputHTMLAttributes } from "react";
import { cn } from "../lib/cn";

/** Labelled text input with an inline validation error slot. The error
 *  text is wired to the input via `aria-describedby` (F003-followup-1) —
 *  the same `id`+`aria-describedby` pairing `StepRowEditor`'s step fields
 *  already use — so a screen reader announces *which* message explains an
 *  invalid field instead of only the generic `aria-invalid`. */
export function TextField({
  label,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null }) {
  const generatedId = useId();
  const inputId = id ?? (label ? `field-${label.toLowerCase().replace(/\s+/g, "-")}` : generatedId);
  const errorId = `${inputId}-error`;
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
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <span id={errorId} role="alert" className="mt-1 block text-[0.7rem] text-loss">
          {error}
        </span>
      ) : null}
    </label>
  );
}
