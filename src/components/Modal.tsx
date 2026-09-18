import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** F003-followup-1: `BuildEditorModal` nests an `IconPicker` `Modal` inside
 *  itself. Without a shared stack, both `Modal`s attach their own unscoped
 *  `document` keydown listener, so one Escape fired *both* `onClose`s —
 *  closing the icon picker also popped the editor's dirty-confirm bar (or
 *  closed the editor outright). This module-level stack lets every mounted
 *  `Modal` ask "am I the topmost dialog right now?" before reacting to
 *  Escape/Tab/backdrop-click, and lets the body-scroll lock survive nested
 *  opens (locked while count > 0, restored to the pre-lock value only when
 *  the outermost modal unmounts). Kept as plain module state rather than
 *  context — a portal-rendered dialog has no guaranteed provider ancestor,
 *  and the stack is process-wide UI chrome, not per-subtree data. */
let openModalStack: string[] = [];
let openModalCount = 0;
let savedBodyOverflow = "";
let modalIdSeq = 0;

function nextModalStackId(): string {
  modalIdSeq += 1;
  return `modal-${modalIdSeq}`;
}

/** Centred modal dialog, portalled onto `document.body` so a `fixed`
 *  backdrop always covers the real viewport regardless of what containing
 *  blocks (transform/filter/backdrop-filter ancestors) exist in the page
 *  tree it's invoked from. Escape and a backdrop click both close it; focus
 *  moves into the dialog on open and is restored to whatever had it before
 *  on close; Tab/Shift+Tab wrap inside; body scroll is locked while open.
 *  When nested, only the topmost dialog reacts to Escape/Tab/backdrop
 *  click — see the module-level stack comment above. */
export function Modal({
  label,
  id,
  onClose,
  /** F003: `BuildEditorModal` needs a much wider dialog than the default
   *  32rem — its dense steps grid (time/food/icon/instruction/row-actions)
   *  truncates badly at the default width. Every other caller (Settings,
   *  icon picker) keeps the compact default. */
  widthClassName = "w-[min(32rem,calc(100vw-2rem))]",
  children,
}: {
  label: string;
  id?: string;
  onClose: () => void;
  widthClassName?: string;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Lazily assigned once per mount (never reassigned on re-render) — this
  // instance's slot in `openModalStack`.
  const stackIdRef = useRef<string | null>(null);
  if (stackIdRef.current === null) {
    stackIdRef.current = nextModalStackId();
  }
  // The focus-trap/lock effect below deliberately runs once per mount (see
  // its own comment) so it never steals focus back or re-locks scroll on
  // every parent re-render. But its `keydown` listener still needs whatever
  // `onClose` the *latest* render passed — a caller like
  // `BuildEditorModal`'s `requestClose` closes over state (`dirty`) that
  // changes after mount, and a handler captured once at mount would keep
  // reading that first render's stale value forever. Routing through a ref
  // that's updated every render keeps the listener itself stable while
  // always calling the current `onClose`.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const stackId = stackIdRef.current as string;

    previouslyFocused.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const dialog = dialogRef.current;
    const target = dialog ? (focusableElements(dialog)[0] ?? dialog) : null;
    target?.focus();

    openModalStack = [...openModalStack, stackId];
    openModalCount += 1;
    if (openModalCount === 1) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    function isTopmost(): boolean {
      return openModalStack[openModalStack.length - 1] === stackId;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (!isTopmost()) return;

      if (event.key === "Escape") {
        onCloseRef.current();
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
      openModalStack = openModalStack.filter((entry) => entry !== stackId);
      openModalCount -= 1;
      if (openModalCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
      previouslyFocused.current?.focus();
    };
  }, []);

  function handleBackdropClick() {
    // A nested modal's backdrop already visually covers this one, but
    // jsdom/tests can fire a click directly on the outer backdrop node
    // without regard for stacking — guard explicitly so an outer `Modal`
    // never closes while an inner one is still open.
    if (openModalStack[openModalStack.length - 1] !== stackIdRef.current) return;
    onClose();
  }

  return createPortal(
    <div
      data-testid="modal-backdrop"
      data-modal-backdrop
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`panel ${widthClassName} max-h-[calc(100vh-2rem)] overflow-y-auto p-6`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
