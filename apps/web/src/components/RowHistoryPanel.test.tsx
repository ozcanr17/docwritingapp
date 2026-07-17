import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RowDetail, RowHistoryEntry } from "../lib/api";
import { RowHistoryPanel } from "./RowHistoryPanel";

const row = {
  id: "row-1",
  title: "Current title",
  description: "Current description",
  numberingStart: null,
  customFields: {},
  requirementDetail: null,
  testCaseDetail: null,
  testStepDetail: null,
} as unknown as RowDetail;

const entry: RowHistoryEntry = {
  id: "event-1:after",
  eventId: "event-1",
  side: "after",
  action: "row.updated",
  version: 1,
  createdAt: "2026-07-17T09:00:00.000Z",
  actor: { id: "user-1", displayName: "Ada", email: "ada@example.test" },
  current: false,
  snapshot: {
    snapshotVersion: 1,
    version: 1,
    title: "Historical title",
    description: "Historical description",
    numberingStart: null,
    customFields: {},
    requirementDetail: null,
    testCaseDetail: null,
    testStepDetail: null,
  },
};

describe("RowHistoryPanel", () => {
  it("requires confirmation before restoring a historical row version", () => {
    const onRestore = vi.fn();
    render(<RowHistoryPanel row={row} entries={[entry]} pending={false} onRestore={onRestore} />);

    fireEvent.click(screen.getByTestId("restore-row-version"));
    expect(onRestore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-restore-row-version"));
    expect(onRestore).toHaveBeenCalledWith(entry);
  });
});
