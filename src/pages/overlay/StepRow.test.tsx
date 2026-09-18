/**
 * F001 "step-columns": a shown column with a missing value renders an empty
 * cell — never a dash/en-dash placeholder — and a hidden column's cell does
 * not exist in the DOM at all.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiBuildStep } from "../../api/schema";
import { StepRow } from "./StepRow";

afterEach(cleanup);

function step(overrides: Partial<ApiBuildStep> = {}): ApiBuildStep {
  return { instruction: "Build a peon", ...overrides };
}

describe("StepRow", () => {
  it("renders an empty time cell (no dash) when the row has no time but the column is shown", () => {
    const { container } = render(
      <StepRow
        index={0}
        step={step()}
        compact={false}
        state="upcoming"
        columns={{ showIndex: true, showTime: true, showSupply: false }}
      />,
    );
    const timeCell = container.querySelector(".overlay-step__time");
    expect(timeCell).not.toBeNull();
    expect(timeCell?.textContent).toBe("");
    expect(container.textContent).not.toContain("–");
    expect(container.textContent).not.toContain("—");
  });

  it("renders an empty supply cell (no dash) when the row has no supply but the column is shown", () => {
    const { container } = render(
      <StepRow
        index={0}
        step={step()}
        compact={false}
        state="upcoming"
        columns={{ showIndex: true, showTime: false, showSupply: true }}
      />,
    );
    const supplyCell = container.querySelector(".overlay-step__supply");
    expect(supplyCell).not.toBeNull();
    expect(supplyCell?.textContent).toBe("");
  });

  it("does not render index/time/supply cells for hidden columns", () => {
    const { container } = render(
      <StepRow
        index={0}
        step={step({ time: "0:00", supply: 5 })}
        compact={false}
        state="upcoming"
        columns={{ showIndex: false, showTime: false, showSupply: false }}
      />,
    );
    expect(container.querySelector(".overlay-step__index")).toBeNull();
    expect(container.querySelector(".overlay-step__time")).toBeNull();
    expect(container.querySelector(".overlay-step__supply")).toBeNull();
  });

  it("renders values in shown cells when present", () => {
    const { container } = render(
      <StepRow
        index={2}
        step={step({ time: "1:30", supply: 8 })}
        compact={false}
        state="upcoming"
        columns={{ showIndex: true, showTime: true, showSupply: true }}
      />,
    );
    expect(container.querySelector(".overlay-step__index")?.textContent).toBe("3");
    expect(container.querySelector(".overlay-step__time")?.textContent).toBe("1:30");
    expect(container.querySelector(".overlay-step__supply")?.textContent).toBe("8");
  });
});
