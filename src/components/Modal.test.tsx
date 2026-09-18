/**
 * C-202: Modal renders into `document.body` via a portal, Escape/backdrop
 * click closes it, clicking inside does not, focus is restored to the
 * trigger after close, and body scroll is locked while open.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open settings</button>
      {open ? (
        <Modal label="Settings" onClose={() => setOpen(false)}>
          <button>First</button>
          <button>Second</button>
        </Modal>
      ) : null}
    </div>
  );
}

describe("Modal", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("portals the dialog onto document.body", () => {
    render(<Modal label="Settings" onClose={() => {}} />);

    const backdrop = screen.getByTestId("modal-backdrop");
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(backdrop.parentElement).toBe(document.body);
    expect(backdrop.contains(dialog)).toBe(true);
  });

  it("sets aria-modal", () => {
    render(<Modal label="Settings" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Settings" }).getAttribute("aria-modal")).toBe("true");
  });

  it("calls onClose on Escape", () => {
    let closed = false;
    render(<Modal label="Settings" onClose={() => (closed = true)} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(closed).toBe(true);
  });

  it("calls onClose on backdrop click but not on click inside", () => {
    let closed = false;
    render(
      <Modal label="Settings" onClose={() => (closed = true)}>
        <button>Inside</button>
      </Modal>,
    );

    fireEvent.click(screen.getByText("Inside"));
    expect(closed).toBe(false);

    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(closed).toBe(true);
  });

  it("restores focus to the trigger after close", async () => {
    render(<Harness />);

    const trigger = screen.getByText("Open settings");
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(trigger);
  });

  it("F003 regression: Escape always calls the latest onClose, even one that closes over state set after mount", () => {
    // A caller like `BuildEditorModal`'s dirty-check `requestClose` passes a
    // new `onClose` function every render, closing over state (`dirty`)
    // that starts `false` and flips `true` later. Modal's focus-trap effect
    // intentionally runs once per mount — if its `keydown` listener ever
    // captured that first `onClose` directly instead of reading it through
    // a ref, this test would see Escape call the stale (always-`false`)
    // closure forever.
    function StatefulHarness() {
      const [armed, setArmed] = useState(false);
      const [calls, setCalls] = useState<boolean[]>([]);
      return (
        <div>
          <button onClick={() => setArmed(true)}>Arm</button>
          <p data-testid="calls">{calls.join(",")}</p>
          <Modal label="Settings" onClose={() => setCalls((c) => [...c, armed])} />
        </div>
      );
    }
    render(<StatefulHarness />);

    fireEvent.click(screen.getByText("Arm"));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByTestId("calls").textContent).toBe("true");
  });

  it("locks and restores body scroll", () => {
    expect(document.body.style.overflow).toBe("");

    const { unmount } = render(<Modal label="Settings" onClose={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  describe("nested modals (F003-followup-1)", () => {
    // `BuildEditorModal` nests an `IconPicker` `Modal` inside itself. Before
    // the stack existed, a single Escape reached both `Modal`s' unscoped
    // `document` keydown listeners, so closing the icon picker also popped
    // the editor's dirty-confirm bar (or closed the editor outright).
    //
    // Each test mounts the outer modal alone first, then rerenders the same
    // component tree with `showInner` flipped on — mirroring the real
    // editor/icon-picker timing (the editor is already open when the picker
    // mounts). The outer `<Modal>` element must stay at the same position
    // across renders (same host component, same JSX slot) so React reuses
    // that fiber instead of unmounting/remounting it — a remount would
    // re-fire the outer's mount effect alongside the inner's in one commit,
    // artificially reproducing the pre-fix simultaneous-mount case instead
    // of testing the real "inner opens later" ordering.
    function NestedHarness({
      showInner,
      outerClose,
      innerClose,
    }: {
      showInner: boolean;
      outerClose: () => void;
      innerClose: () => void;
    }) {
      return (
        <Modal label="Outer" onClose={outerClose}>
          {showInner ? <Modal label="Inner" onClose={innerClose} /> : null}
        </Modal>
      );
    }

    it("scopes Escape to only the topmost modal", () => {
      const outerClose = vi.fn();
      const innerClose = vi.fn();
      const { rerender } = render(
        <NestedHarness showInner={false} outerClose={outerClose} innerClose={innerClose} />,
      );
      rerender(<NestedHarness showInner={true} outerClose={outerClose} innerClose={innerClose} />);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(innerClose).toHaveBeenCalledTimes(1);
      expect(outerClose).not.toHaveBeenCalled();
    });

    it("closes the outer modal on the next Escape once the inner one has unmounted", () => {
      const outerClose = vi.fn();
      const innerClose = vi.fn();
      const { rerender } = render(
        <NestedHarness showInner={false} outerClose={outerClose} innerClose={innerClose} />,
      );
      rerender(<NestedHarness showInner={true} outerClose={outerClose} innerClose={innerClose} />);
      rerender(<NestedHarness showInner={false} outerClose={outerClose} innerClose={innerClose} />);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(outerClose).toHaveBeenCalledTimes(1);
      expect(innerClose).not.toHaveBeenCalled();
    });

    it("ignores a click on the outer backdrop while an inner modal is open", () => {
      const outerClose = vi.fn();
      const innerClose = vi.fn();
      const { rerender } = render(
        <NestedHarness showInner={false} outerClose={outerClose} innerClose={innerClose} />,
      );
      rerender(<NestedHarness showInner={true} outerClose={outerClose} innerClose={innerClose} />);

      const [outerBackdrop] = screen.getAllByTestId("modal-backdrop");
      fireEvent.click(outerBackdrop);

      expect(outerClose).not.toHaveBeenCalled();
    });

    it("keeps body scroll locked until both nested modals have unmounted", () => {
      const { rerender, unmount } = render(
        <NestedHarness showInner={false} outerClose={() => {}} innerClose={() => {}} />,
      );
      expect(document.body.style.overflow).toBe("hidden");

      rerender(<NestedHarness showInner={true} outerClose={() => {}} innerClose={() => {}} />);
      expect(document.body.style.overflow).toBe("hidden");

      rerender(<NestedHarness showInner={false} outerClose={() => {}} innerClose={() => {}} />);
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });
  });
});
