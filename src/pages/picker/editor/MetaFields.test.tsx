/**
 * F003-followup-1: the Build-section fields must wire their `role="alert"`
 * error text to the input via `aria-describedby`, the same pairing
 * `StepRowEditor`'s step fields already use — not just the generic
 * `aria-invalid`.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { blankEditorForm, type EditorFieldErrors } from "../../../lib/buildEditorSchema";
import { MetaFields } from "./MetaFields";

function renderWithErrors(errors: EditorFieldErrors) {
  render(<MetaFields form={blankEditorForm()} apiBase="https://api.test" errors={errors} onChange={() => {}} />);
}

describe("MetaFields", () => {
  afterEach(cleanup);

  it("wires an invalid title's error text to the input via aria-describedby", () => {
    renderWithErrors({ title: "Say what this build does" });

    // The accessible name concatenates the `<label>`'s own text with the
    // sibling error `<span>` it wraps, so a field with an error can no
    // longer be found by its bare label text alone.
    const input = screen.getByRole("textbox", { name: /Title/ });
    const describedById = input.getAttribute("aria-describedby");

    expect(describedById).toBeTruthy();
    const errorNode = document.getElementById(describedById as string);
    expect(errorNode).not.toBeNull();
    expect(errorNode?.getAttribute("role")).toBe("alert");
    expect(errorNode?.textContent).toBe("Say what this build does");
  });

  it("wires an invalid difficulty's error text to the select via aria-describedby", () => {
    renderWithErrors({ difficulty: "Pick a difficulty" });

    const select = screen.getByRole("combobox", { name: /Difficulty/ });
    const describedById = select.getAttribute("aria-describedby");

    expect(describedById).toBeTruthy();
    const errorNode = document.getElementById(describedById as string);
    expect(errorNode).not.toBeNull();
    expect(errorNode?.getAttribute("role")).toBe("alert");
    expect(errorNode?.textContent).toBe("Pick a difficulty");
  });

  it("wires an invalid summary's error text to the textarea via aria-describedby", () => {
    renderWithErrors({ summary: "Keep it under 200 characters" });

    const textarea = screen.getByRole("textbox", { name: /Summary/ });
    const describedById = textarea.getAttribute("aria-describedby");

    expect(describedById).toBeTruthy();
    const errorNode = document.getElementById(describedById as string);
    expect(errorNode).not.toBeNull();
    expect(errorNode?.getAttribute("role")).toBe("alert");
    expect(errorNode?.textContent).toBe("Keep it under 200 characters");
  });

  it("leaves aria-describedby unset when a field has no error", () => {
    renderWithErrors({});

    expect(screen.getByRole("textbox", { name: "Title" }).hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByRole("combobox", { name: "Difficulty" }).hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByRole("textbox", { name: /Summary/ }).hasAttribute("aria-describedby")).toBe(false);
  });
});
