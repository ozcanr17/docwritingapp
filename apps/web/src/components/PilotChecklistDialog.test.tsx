import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PilotChecklistDialog } from "./PilotChecklistDialog";

describe("PilotChecklistDialog", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists pilot readiness progress on the current device", () => {
    render(<PilotChecklistDialog onClose={() => undefined} />);
    fireEvent.click(screen.getByTestId("pilot-check-roles"));
    expect(JSON.parse(window.localStorage.getItem("docsys.pilotChecklist") ?? "[]")).toContain("roles");
    expect(screen.getByText("14%")).toBeVisible();
  });
});
