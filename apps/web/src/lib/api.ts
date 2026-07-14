export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export const WS_URL = API_URL.replace(/^http/, "ws");
export const COLLAB_URL = import.meta.env.VITE_COLLAB_URL ?? "ws://localhost:3002";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`API error ${status}`);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    ...rest,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export type RowType = "heading" | "requirement" | "test_case" | "test_step" | "note";

export interface OutlineRow {
  id: string;
  parentId: string | null;
  rank: string;
  depth: number;
  rowType: RowType;
  title: string;
  description: string | null;
  customFields: Record<string, unknown>;
  status: string | null;
  priority: string | null;
  tags: string[];
  action: string | null;
  expectedResult: string | null;
  version: number;
  displayNumber: string;
}

export type CustomFieldType =
  | "text"
  | "long_text"
  | "integer"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "single_select"
  | "multi_select"
  | "user"
  | "project"
  | "url";

export interface FieldDefinition {
  id: string;
  fieldKey: string;
  displayName: string;
  fieldType: CustomFieldType;
  allowedValues: string[];
  displayOrder: number;
}

export interface RequirementLink {
  id: string;
  sourceRowId: string;
  targetRowId: string;
  linkType: "verifies" | "relates_to" | "derives_from" | "duplicates";
}

export interface RowDetail {
  id: string;
  documentId: string;
  parentId: string | null;
  rowType: OutlineRow["rowType"];
  title: string;
  description: string | null;
  version: number;
  customFields: Record<string, unknown>;
  requirementDetail: { status: string; priority: string | null; rationale: string | null } | null;
  testCaseDetail: { status: string; priority: string | null; assigneeId: string | null; tags: string[] } | null;
  testStepDetail: { action: string | null; expectedResult: string | null } | null;
  outgoingLinks: RequirementLink[];
  incomingLinks: RequirementLink[];
  rowProjects: { id: string; projectId: string }[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  documentType: string;
  folderId: string | null;
  version: number;
}

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}
