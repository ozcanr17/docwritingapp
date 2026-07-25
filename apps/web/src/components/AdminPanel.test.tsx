import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import i18n from "../lib/i18n";
import { api } from "../lib/api";
import { AdminPanel } from "./AdminPanel";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return { ...actual, api: vi.fn() };
});

describe("AdminPanel", () => {
  it("separates organization scope, users, audit and feedback", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("/members"))
        return [
          {
            id: "admin",
            email: "admin@example.com",
            displayName: "Admin User",
            isActive: true,
            roleKey: "organization_admin",
          },
        ];
      if (path.endsWith("/administration-summary"))
        return {
          scope: {
            workspaces: 2,
            projects: 3,
            documents: 18,
            restrictedDocuments: 4,
          },
          recentAudit: [
            {
              id: "audit",
              action: "document.updated",
              entityType: "document",
              entityId: "document",
              actorId: "admin",
              workspaceId: "workspace",
              documentId: "document",
              createdAt: "2026-07-24T10:00:00.000Z",
            },
          ],
        };
      if (path.endsWith("/pilot-feedback")) return [];
      return [];
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AdminPanel
          organizationId="organization"
          currentUserId="admin"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("18")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: i18n.t("adminOverview") })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: i18n.t("auditLog") }));
    expect(await screen.findByText("document.updated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: i18n.t("usersAndRoles") }));
    expect(await screen.findByText("Admin User")).toBeInTheDocument();
  });

  it("configures work item types and fields per project", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/workspaces/workspace/projects")
        return [
          { id: "project-sys", code: "SYS", name: "System" },
          { id: "project-ver", code: "VER", name: "Verification" },
        ];
      if (path === "/workspaces/workspace/project-access") return { canManage: true, canCreate: true };
      if (path === "/projects/project-ver/work-item-schema")
        return { types: [{ id: "type-bug", key: "bug", name: "Bug", baseType: "bug", color: null, isSystem: true, displayOrder: 3 }], fields: [] };
      if (path.endsWith("/work-item-schema")) return { types: [], fields: [] };
      if (path.endsWith("/administration-summary")) return { scope: { workspaces: 1, projects: 2, documents: 0, restrictedDocuments: 0 }, recentAudit: [] };
      return [];
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <AdminPanel organizationId="organization" workspaceId="workspace" currentUserId="admin" onClose={vi.fn()} variant="page" section="projects" onSectionChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("admin-project-SYS")).toBeInTheDocument();
    expect(screen.getByTestId("admin-project-SYS")).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByTestId("project-schema-admin")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("admin-project-VER"));
    expect(await screen.findByTestId("schema-type-bug")).toBeInTheDocument();
    expect(screen.getByTestId("admin-project-SYS")).toHaveAttribute("aria-pressed", "false");
  });
});
