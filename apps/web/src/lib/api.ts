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
  const { headers, body, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      ...(body !== undefined && body !== null ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    ...(body !== undefined ? { body } : {}),
    ...rest,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export type RowType = "heading" | "requirement" | "test_case" | "test_step" | "note";
export type DocumentType = "requirement" | "test" | "general_document";

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
  testResult: string | null;
  requirementNo: string | null;
  linkedRequirements: Array<{
    id: string;
    requirementNo: string | null;
    title: string;
    description: string | null;
    documentTitle: string;
  }>;
  linkCount: number;
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
  suspect: boolean;
  sourceRow?: LinkedRowSummary;
  targetRow?: LinkedRowSummary;
}

export interface LinkedRowSummary {
  id: string;
  title: string;
  rowType: RowType;
  requirementDetail?: { requirementNo: string | null } | null;
  document: { id: string; title: string; documentType: DocumentType };
}

export interface LinkCandidate extends LinkedRowSummary {
  description: string | null;
  requirementDetail: { requirementNo: string | null } | null;
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
  requirementDetail: { requirementNo: string | null; status: string; priority: string | null; rationale: string | null } | null;
  testCaseDetail: { status: string; priority: string | null; assigneeId: string | null; tags: string[] } | null;
  testStepDetail: { action: string | null; expectedResult: string | null; testResult: string | null } | null;
  outgoingLinks: RequirementLink[];
  incomingLinks: RequirementLink[];
  rowProjects: { id: string; projectId: string }[];
}

export interface DocumentSummary {
  id: string;
  title: string;
  documentType: DocumentType;
  folderId: string | null;
  version: number;
}

export interface FolderSummary {
  id: string;
  name: string;
  parentId: string | null;
  version: number;
}

export interface SavedView {
  id: string;
  name: string;
  scope: "personal" | "team";
  filters: Array<Record<string, unknown>>;
  sorting: Array<Record<string, unknown>>;
  visibleColumns: string[];
  frozenColumns: string[];
  linkProjection: { fields?: string[]; separator?: string; sortBy?: string };
  isDefault: boolean;
}

export interface DashboardSummary {
  qualityScore: number;
  qualityIssues: number;
  requirements: number;
  coveredRequirements: number;
  suspectLinks: number;
  incompleteTests: number;
  executions: { total: number; passed: number; failed: number; blocked: number };
}

export interface RowComment {
  id: string;
  body: string;
  mentions: string[];
  resolvedAt: string | null;
  createdAt: string;
  author: { id: string; displayName: string; email: string };
}

export interface TestExecution {
  id: string;
  status: "not_run" | "running" | "passed" | "failed" | "blocked" | "skipped";
  environment: string | null;
  buildReference: string | null;
  iteration: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  steps: Array<{
    id: string;
    status: "not_run" | "running" | "passed" | "failed" | "blocked" | "skipped";
    actualResult: string | null;
    testStepRow: { id: string; title: string; testStepDetail: { action: string | null; expectedResult: string | null } | null };
  }>;
}
