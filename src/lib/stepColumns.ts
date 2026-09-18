/**
 * Which step-list columns are worth showing at all. A column that has no
 * data across the whole build (no step has a time / a food value) is
 * dropped entirely — see F001 "step-columns": the panel must not render a
 * header or per-row cell for data the build never provides.
 */
import { parseClock } from "../store/timer";

export interface StepColumnStep {
  time?: string;
  supply?: number;
}

export interface StepColumns {
  showIndex: boolean;
  showTime: boolean;
  showSupply: boolean;
}

export function columnsFor(steps: StepColumnStep[], compact: boolean): StepColumns {
  return {
    showIndex: !compact,
    showTime: steps.some((step) => parseClock(step.time) !== undefined),
    showSupply: !compact && steps.some((step) => step.supply != null),
  };
}

const INDEX_TRACK = "1.3em";
const TIME_TRACK = "3rem";
const SUPPLY_TRACK = "1.8em";
const CONTENT_TRACK = "minmax(0, 1fr)";

/**
 * Grid-template-columns shared by the header row and every step row, built
 * from only the visible columns, so header labels always line up with the
 * cells beneath them regardless of which columns a given build has.
 */
export function gridTemplateColumns(columns: StepColumns): string {
  return [
    columns.showIndex && INDEX_TRACK,
    columns.showTime && TIME_TRACK,
    columns.showSupply && SUPPLY_TRACK,
    CONTENT_TRACK,
  ]
    .filter((track): track is string => Boolean(track))
    .join(" ");
}
