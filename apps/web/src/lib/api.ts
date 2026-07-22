const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
const DEFAULT_COLLAB_URL = import.meta.env.VITE_COLLAB_URL ?? "ws://localhost:3002";
const SERVER_STORAGE_KEY = "docsys.serverUrl";
const TOKEN_STORAGE_KEY = "docsys.desktopSession";

let apiUrl = readStorage("localStorage", SERVER_STORAGE_KEY) || DEFAULT_API_URL;
let collabUrl = DEFAULT_COLLAB_URL;
let sessionToken = readStorage("localStorage", TOKEN_STORAGE_KEY) || readStorage("sessionStorage", TOKEN_STORAGE_KEY);

function readStorage(kind: "localStorage" | "sessionStorage", key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window[kind].getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(kind: "localStorage" | "sessionStorage", key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window[kind].setItem(key, value);
    else window[kind].removeItem(key);
  } catch {
    return;
  }
}

function normalizeServerUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) return DEFAULT_API_URL;
  const parsed = new URL(normalized);
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) throw new Error("Invalid server protocol");
  return parsed.toString().replace(/\/$/, "");
}

export function getApiUrl(): string {
  return apiUrl;
}

export function getWsUrl(): string {
  return apiUrl.replace(/^http/, "ws");
}

export function getCollabUrl(): string {
  return collabUrl;
}

export function getServerAddress(): string {
  return readStorage("localStorage", SERVER_STORAGE_KEY);
}

export function getSessionToken(): string {
  return sessionToken;
}

export function setServerAddress(value: string): void {
  apiUrl = normalizeServerUrl(value);
  collabUrl = DEFAULT_COLLAB_URL;
  writeStorage("localStorage", SERVER_STORAGE_KEY, value.trim() ? apiUrl : "");
}

export function setSessionToken(token: string | null, rememberMe = false): void {
  sessionToken = token ?? "";
  writeStorage("sessionStorage", TOKEN_STORAGE_KEY, rememberMe ? "" : sessionToken);
  writeStorage("localStorage", TOKEN_STORAGE_KEY, rememberMe ? sessionToken : "");
}

export async function refreshClientConfig(): Promise<void> {
  const response = await fetch(`${apiUrl}/auth/client-config`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Client configuration unavailable");
  const payload = (await response.json()) as { collaborationUrl?: string };
  if (!payload.collaborationUrl || !/^wss?:\/\//.test(payload.collaborationUrl)) {
    throw new Error("Invalid collaboration URL");
  }
  collabUrl = payload.collaborationUrl.replace(/\/+$/, "");
}

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
  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    headers: {
      ...(body !== undefined && body !== null ? { "Content-Type": "application/json" } : {}),
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
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

export type WorkItemType = "epic" | "story" | "task" | "bug" | "risk";
export type WorkItemStatus = "backlog" | "ready" | "in_progress" | "in_review" | "done" | "canceled";
export type WorkItemPriority = "lowest" | "low" | "medium" | "high" | "highest" | "critical";

export interface WorkItemSummary {
  id: string;
  key: string;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  title: string;
  description: string | null;
  labels: string[];
  version: number;
  dueAt: string | null;
  project: { id: string; name: string; code: string };
  reporter: { id: string; displayName: string };
  assignee: { id: string; displayName: string } | null;
  _count: { artifactLinks: number; comments: number };
}

export interface TestPlanSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "completed" | "canceled";
  environment: string | null;
  buildReference: string | null;
  version: number;
  owner: { id: string; displayName: string };
  _count: { items: number };
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  department: string | null;
  phone: string | null;
  bio: string | null;
}

export interface OutlineRow {
  id: string;
  objectNumber: number;
  numberingStart: number | null;
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
  linkedObjects: Array<{
    id: string;
    rowType: RowType;
    requirementNo: string | null;
    title: string;
    description: string | null;
    action: string | null;
    expectedResult: string | null;
    document: { id: string; title: string; documentType: DocumentType };
  }>;
  linkCount: number;
  version: number;
  updatedAt: string;
  updatedById: string | null;
  changeState: "baseline" | "saved_self" | "saved_other";
  displayNumber: string;
  stepNumber: number | null;
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
  objectNumber: number;
  numberingStart: number | null;
  documentId: string;
  parentId: string | null;
  rowType: OutlineRow["rowType"];
  title: string;
  description: string | null;
  version: number;
  customFields: Record<string, unknown>;
  document: { id: string; title: string; documentType: DocumentType };
  requirementDetail: { requirementNo: string | null; status: string; priority: string | null; rationale: string | null } | null;
  testCaseDetail: { status: string; priority: string | null; assigneeId: string | null; tags: string[] } | null;
  testStepDetail: { stepNumber: number | null; action: string | null; expectedResult: string | null; testResult: string | null } | null;
  outgoingLinks: RequirementLink[];
  incomingLinks: RequirementLink[];
  rowProjects: { id: string; projectId: string }[];
}

export interface RowHistoryEntry {
  id: string;
  eventId: string;
  side: "before" | "after";
  action: "row.updated" | "row.version_restored";
  version: number;
  createdAt: string;
  current: boolean;
  actor: { id: string; displayName: string; email: string } | null;
  snapshot: {
    snapshotVersion: 1;
    version: number;
    title: string;
    description: string | null;
    numberingStart: number | null;
    customFields: Record<string, unknown>;
    requirementDetail: Record<string, unknown> | null;
    testCaseDetail: Record<string, unknown> | null;
    testStepDetail: Record<string, unknown> | null;
  };
}

export interface DocumentHistoryEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  actor: { id: string; displayName: string; email: string } | null;
  row: { id: string; objectNumber: number; title: string; rowType: RowType } | null;
  metadata: Record<string, unknown> | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  documentType: DocumentType;
  folderId: string | null;
  version: number;
  requirementPrefix?: string;
  access?: { accessLevel: "read" | "write" | "manage" | null; canRead: boolean; canWrite: boolean; canManage: boolean; restricted: boolean };
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

export type ReleaseReadinessStatus = "ready" | "warning" | "blocked";
export type ReleaseReadinessGateStatus = "passed" | "warning" | "failed" | "not_applicable";

export interface ReleaseReadinessReport {
  status: ReleaseReadinessStatus;
  score: number;
  generatedAt: string;
  gates: Array<{
    key: "content" | "traceability" | "links_current" | "verification" | "review";
    required: boolean;
    status: ReleaseReadinessGateStatus;
    issueCount: number;
  }>;
  counts: {
    rows: number;
    requirements: number;
    testSteps: number;
    qualityErrors: number;
    qualityWarnings: number;
    uncoveredRequirements: number;
    unlinkedTestSteps: number;
    incompleteTestSteps: number;
    unverifiedTestSteps: number;
    suspectLinks: number;
    retestCandidates: number;
    failedLatestExecutions: number;
  };
  issues: Array<{
    rule: string;
    severity: "error" | "warning";
    rowId: string;
    objectNumber: number | null;
    title: string;
  }>;
  retestCandidates: Array<{
    rowId: string;
    objectNumber: number;
    title: string;
    document: { id: string; title: string; documentType: DocumentType };
    reason: string;
  }>;
  failedExecutions: Array<{
    rowId: string;
    objectNumber: number;
    title: string;
    status: string;
    completedAt: string | null;
  }>;
  latestReview: { id: string; title: string; status: string; updatedAt: string } | null;
  baseline: {
    revisionNumber: number;
    semanticVersion: string;
    createdAt: string;
    changedRows: number;
    removedRows: number;
    current: boolean;
  } | null;
}

export interface ImpactAnalysis {
  impactDepth: number;
  baseline: { revisionNumber: number; semanticVersion: string; createdAt: string } | null;
  changedRows: Array<{ rowId: string; objectNumber: number; title: string; rowType: string }>;
  affectedRowCount: number;
  traversedLinkCount: number;
  retestCandidates: Array<{
    rowId: string;
    objectNumber: number;
    title: string;
    rowType: "test_case" | "test_step";
    document: { id: string; title: string; documentType: DocumentType };
    reason: "suspect_link" | "baseline_change";
    sourceRowIds: string[];
  }>;
}

export interface RetestPackage {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "canceled";
  sourceRevisionNumber: number | null;
  impactDepth: number;
  createdAt: string;
  completedAt: string | null;
  createdBy: { id: string; displayName: string };
  sourceDocument: { id: string; title: string; documentType: DocumentType };
  progress: { total: number; completed: number; passed: number; failed: number };
  items: Array<{
    id: string;
    reason: string;
    sourceRowIds: string[];
    testRow: { id: string; objectNumber: number; title: string; rowType: string; deletedAt: string | null; document: { id: string; title: string; documentType: DocumentType } };
    executions: Array<{ id: string; status: string; createdAt: string; completedAt: string | null }>;
  }>;
}

export interface DocumentTemplateSummary {
  id: string;
  name: string;
  documentType: DocumentType;
  templateKind: "document" | "section";
  version: number;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface RowComment {
  id: string;
  body: string;
  mentions: string[];
  anchor: { field?: "title" | "description" | "action" | "expectedResult"; start?: number; end?: number; quotedText?: string };
  suggestedReplacement: string | null;
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
    evidence: Array<{
      id: string;
      kind: "attachment" | "defect";
      addedAt: string;
      addedById: string;
      attachmentId?: string;
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
      reference?: string;
      summary?: string;
      url?: string;
    }>;
    testStepRow: { id: string; title: string; testStepDetail: { action: string | null; expectedResult: string | null } | null };
  }>;
}
