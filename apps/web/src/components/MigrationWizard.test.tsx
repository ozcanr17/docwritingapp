import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { MigrationWizard } from "./MigrationWizard";

vi.mock("../lib/api", () => ({ api: vi.fn() }));

const mockedApi = vi.mocked(api);

function renderWizard(onImported = vi.fn(async () => undefined)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MigrationWizard documentId="document" format="csv" fileName="pilot.csv" content="type,title\nheading,Scope" onClose={vi.fn()} onImported={onImported} /></QueryClientProvider>);
  return onImported;
}

describe("MigrationWizard", () => {
  beforeEach(() => mockedApi.mockReset());

  it("shows a non-mutating preview and imports only after confirmation", async () => {
    mockedApi.mockResolvedValueOnce({ valid: true, rowCount: 1, counts: { heading: 1, requirement: 0, test_case: 0, test_step: 0, note: 0 }, findings: [], sample: [{ sourceRow: 2, level: 0, rowType: "heading", title: "Scope", requirementNo: "", action: "" }] }).mockResolvedValueOnce({ importedRows: 1 });
    const onImported = renderWizard();
    expect(await screen.findByTestId("migration-preview-valid")).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("confirm-migration-import"));
    await waitFor(() => expect(onImported).toHaveBeenCalledOnce());
    expect(mockedApi.mock.calls[1]?.[0]).toBe("/documents/document/imports");
  });

  it("blocks confirmation when validation contains errors", async () => {
    mockedApi.mockResolvedValueOnce({ valid: false, rowCount: 1, counts: { heading: 0, requirement: 1, test_case: 0, test_step: 0, note: 0 }, findings: [{ severity: "error", code: "duplicate_number_in_file", row: 2, value: "REQ-001" }], sample: [] });
    renderWizard();
    expect(await screen.findByTestId("import-finding-error")).toBeVisible();
    expect(screen.getByTestId("confirm-migration-import")).toBeDisabled();
    expect(mockedApi).toHaveBeenCalledTimes(1);
  });
});
