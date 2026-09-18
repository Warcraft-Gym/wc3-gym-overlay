import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Centred modal dialog, portalled onto `document.body` so a `fixed`
 *  backdrop always covers the real viewport regardless of what containing
 *  blocks (transform/filter/backdrop-filter ancestors) exist in the page
 *  tree it's invoked from. Escape and a backdrop click both close it; focus
 *  moves into the dialog on open and is restored to whatever had it before
 *  on close; Tab/Shift+Tab wrap inside; body scroll is locked while open. */
export function Modal({
  label,
  id,
  onClose,
  children,
}: {
  label: string;
  id?: string;
  onClose: () => void;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    const target = dialog ? (focusableElements(dialog)[0] ?? dialog) : null;
    target?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = focusableElements(dialogRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      data-testid="modal-backdrop"
      data-modal-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="panel w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] overflow-y-auto p-6"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
