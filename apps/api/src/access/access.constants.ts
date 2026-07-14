export const PERMISSIONS = [
  "org.read",
  "org.manage",
  "workspace.read",
  "workspace.manage",
  "project.read",
  "project.manage",
  "document.read",
  "document.write",
  "document.manage",
  "row.read",
  "row.write",
  "audit.read",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES: Record<string, { name: string; permissions: readonly PermissionKey[] }> = {
  system_admin: { name: "System Admin", permissions: PERMISSIONS },
  organization_admin: { name: "Organization Admin", permissions: PERMISSIONS },
  workspace_admin: {
    name: "Workspace Admin",
    permissions: [
      "org.read",
      "workspace.read",
      "workspace.manage",
      "project.read",
      "project.manage",
      "document.read",
      "document.write",
      "document.manage",
      "row.read",
      "row.write",
      "audit.read",
    ],
  },
  project_manager: {
    name: "Project Manager",
    permissions: ["org.read", "workspace.read", "project.read", "project.manage", "document.read", "document.write", "row.read", "row.write"],
  },
  editor: {
    name: "Editor",
    permissions: ["org.read", "workspace.read", "project.read", "document.read", "document.write", "row.read", "row.write"],
  },
  reviewer: {
    name: "Reviewer",
    permissions: ["org.read", "workspace.read", "project.read", "document.read", "row.read"],
  },
  viewer: {
    name: "Viewer",
    permissions: ["org.read", "workspace.read", "project.read", "document.read", "row.read"],
  },
};
