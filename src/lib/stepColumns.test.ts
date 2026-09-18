import { describe, expect, it } from "vitest";
import { columnsFor, gridTemplateColumns } from "./stepColumns";

describe("columnsFor", () => {
  it("shows index, time, and supply when every step has time and supply", () => {
    const steps = [
      { time: "0:00", supply: 5 },
      { time: "1:30", supply: 8 },
    ];
    expect(columnsFor(steps, false)).toEqual({ showIndex: true, showTime: true, showSupply: true });
  });

  it("hides time and supply when no step has either", () => {
    const steps = [{}, {}];
    expect(columnsFor(steps, false)).toEqual({ showIndex: true, showTime: false, showSupply: false });
  });

  it("shows time when only some rows have a valid time (partial)", () => {
    const steps = [{ time: "0:00" }, {}, { time: "bogus" }];
    expect(columnsFor(steps, false)).toEqual({ showIndex: true, showTime: true, showSupply: false });
  });

  it("shows supply when only some rows have a supply value (partial)", () => {
    const steps = [{ supply: 5 }, {}];
    expect(columnsFor(steps, false)).toEqual({ showIndex: true, showTime: false, showSupply: true });
  });

  it("hides index and supply in compact mode even when the data exists", () => {
    const steps = [{ time: "0:00", supply: 5 }];
    expect(columnsFor(steps, true)).toEqual({ showIndex: false, showTime: true, showSupply: false });
  });

  it("treats an empty step list as having no time and no supply", () => {
    expect(columnsFor([], false)).toEqual({ showIndex: true, showTime: false, showSupply: false });
  });
});

describe("gridTemplateColumns", () => {
  it("includes a track per visible column plus the content track", () => {
    expect(gridTemplateColumns({ showIndex: true, showTime: true, showSupply: true })).toBe(
      "1.3em 3rem 1.8em minmax(0, 1fr)",
    );
  });

  it("drops the track for hidden columns", () => {
    expect(gridTemplateColumns({ showIndex: false, showTime: true, showSupply: false })).toBe(
      "3rem minmax(0, 1fr)",
    );
  });

  it("keeps only the content track when nothing else is shown", () => {
    expect(gridTemplateColumns({ showIndex: false, showTime: false, showSupply: false })).toBe(
      "minmax(0, 1fr)",
    );
  });
});
