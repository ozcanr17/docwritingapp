export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
export const WS_URL = API_URL.replace(/^http/, "ws");

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

export interface OutlineRow {
  id: string;
  parentId: string | null;
  rank: string;
  depth: number;
  rowType: "heading" | "requirement" | "test_case" | "test_step" | "note";
  title: string;
  version: number;
  displayNumber: string;
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
