import { api } from "./api";

const STORAGE_KEY = "docsys.pilotTelemetry";

export function pilotTelemetryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(STORAGE_KEY) === "enabled"; } catch { return false; }
}

export function setPilotTelemetryEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, enabled ? "enabled" : "disabled"); } catch { return; }
}

export async function recordPilotEvent(organizationId: string | null, eventName: "document_opened" | "import_previewed" | "import_completed" | "baseline_created" | "test_execution_completed" | "feedback_opened", metadata: Record<string, string | number | boolean> = {}): Promise<void> {
  if (!organizationId || !pilotTelemetryEnabled()) return;
  try {
    await api(`/organizations/${organizationId}/usage-events`, { method: "POST", body: JSON.stringify({ consent: true, eventName, metadata }) });
  } catch {
    return;
  }
}
