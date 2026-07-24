import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { api } from "../lib/api";
import { useAuthoringPreferencesStore } from "../stores/authoringPreferences";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn(async () => []) };
});

describe("WorkspaceSettingsDialog", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockResolvedValue([]);
    useAuthoringPreferencesStore.getState().reset();
  });

  it("groups appearance, authoring, accessibility, notifications and integrations", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <WorkspaceSettingsDialog
          organizationId="organization"
          workspaceId="workspace"
          documentId={null}
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: i18n.t("appearanceSettings") })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("accessibilitySettings") }));
    fireEvent.click(screen.getByText(i18n.t("reduceMotion")));
    expect(useAuthoringPreferencesStore.getState().reduceMotion).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("notifications") }));
    fireEvent.click(screen.getByText(i18n.t("notifyMentions")));
    expect(useAuthoringPreferencesStore.getState().notifyMentions).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: i18n.t("integrations") }));
    expect(screen.getByText(i18n.t("configurations"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("sso"))).toBeInTheDocument();
  });
});
