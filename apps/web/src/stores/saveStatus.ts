import { create } from "zustand";

export type SaveState = "saved" | "saving" | "offline" | "conflict";

interface DocumentSaveStatus {
  state: SaveState;
  updatedAt: number;
}

interface SaveStatusStore {
  documents: Record<string, DocumentSaveStatus>;
  setStatus: (documentId: string, state: SaveState) => void;
  statusOf: (documentId: string | null) => DocumentSaveStatus;
}

const DEFAULT_STATUS: DocumentSaveStatus = { state: "saved", updatedAt: 0 };

export const useSaveStatusStore = create<SaveStatusStore>((set, get) => ({
  documents: {},
  setStatus: (documentId, state) => set((current) => ({
    documents: { ...current.documents, [documentId]: { state, updatedAt: Date.now() } },
  })),
  statusOf: (documentId) => documentId ? get().documents[documentId] ?? DEFAULT_STATUS : DEFAULT_STATUS,
}));
