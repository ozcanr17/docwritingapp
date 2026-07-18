import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { pilotTelemetryEnabled, recordPilotEvent, setPilotTelemetryEnabled } from "./pilotTelemetry";

vi.mock("./api", () => ({ api: vi.fn() }));

describe("pilot telemetry", () => {
  beforeEach(() => { window.localStorage.clear(); vi.mocked(api).mockReset(); });

  it("is opt-in and sends only after explicit enablement", async () => {
    expect(pilotTelemetryEnabled()).toBe(false);
    await recordPilotEvent("organization", "document_opened", { documentType: "test" });
    expect(api).not.toHaveBeenCalled();
    setPilotTelemetryEnabled(true);
    await recordPilotEvent("organization", "document_opened", { documentType: "test" });
    expect(api).toHaveBeenCalledWith("/organizations/organization/usage-events", expect.objectContaining({ method: "POST" }));
  });
});
