import { ExecutionStatusKey, ExecutionStatusTotals } from "./api";
import { LozengeAppearance, StatusBarSegment, StatusBarTone } from "../components/ui";

export const EXECUTION_STATUS_ORDER: ExecutionStatusKey[] = ["passed", "failed", "blocked", "skipped", "running", "not_run"];

export const executionStatusAppearance: Record<ExecutionStatusKey, LozengeAppearance> = {
  passed: "success",
  failed: "danger",
  blocked: "warning",
  skipped: "info",
  running: "primary",
  not_run: "neutral",
};

/** Skipped uses violet in bars so it never reads as the blue "running" segment. */
const barTone: Record<ExecutionStatusKey, StatusBarTone> = {
  ...executionStatusAppearance,
  skipped: "violet",
};

const totalsKey: Record<ExecutionStatusKey, keyof ExecutionStatusTotals> = {
  passed: "passed",
  failed: "failed",
  blocked: "blocked",
  skipped: "skipped",
  running: "running",
  not_run: "notRun",
};

/** Builds the StatusBar segments in a fixed order so the bar reads the same everywhere. */
export function executionSegments(
  totals: ExecutionStatusTotals,
  label: (status: ExecutionStatusKey) => string,
): StatusBarSegment[] {
  return EXECUTION_STATUS_ORDER.map((status) => ({
    key: status,
    label: label(status),
    value: totals[totalsKey[status]],
    appearance: barTone[status],
  }));
}
