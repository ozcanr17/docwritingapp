import { create } from "zustand";

export type EditHistoryCommand =
  | {
      kind: "cell";
      rowId: string;
      columnKey: string;
      beforeValue: string;
      afterValue: string;
      beforeNumbering?: string | null;
      afterNumbering?: string | null;
    }
  | { kind: "create"; rowId: string }
  | { kind: "delete"; rowId: string }
  | { kind: "status"; rowId: string; beforeStatus: string; afterStatus: string }
  | {
      kind: "move";
      rowId: string;
      beforeParentId: string | null;
      beforeAfterRowId?: string;
      afterParentId: string | null;
      afterAfterRowId?: string;
    };

interface DocumentHistory {
  undo: EditHistoryCommand[];
  redo: EditHistoryCommand[];
}

interface EditHistoryState {
  documents: Record<string, DocumentHistory>;
  busy: Record<string, boolean>;
  push: (documentId: string, command: EditHistoryCommand) => void;
  takeUndo: (documentId: string) => EditHistoryCommand | null;
  takeRedo: (documentId: string) => EditHistoryCommand | null;
  rollbackUndo: (documentId: string, command: EditHistoryCommand) => void;
  rollbackRedo: (documentId: string, command: EditHistoryCommand) => void;
  clear: (documentId: string) => void;
  setBusy: (documentId: string, busy: boolean) => void;
  reset: () => void;
}

const EMPTY_HISTORY: DocumentHistory = { undo: [], redo: [] };

export const useEditHistoryStore = create<EditHistoryState>((set, get) => ({
  documents: {},
  busy: {},
  push: (documentId, command) => set((state) => {
    const current = state.documents[documentId] ?? EMPTY_HISTORY;
    return {
      documents: {
        ...state.documents,
        [documentId]: { undo: [...current.undo, command].slice(-30), redo: [] },
      },
    };
  }),
  takeUndo: (documentId) => {
    const current = get().documents[documentId] ?? EMPTY_HISTORY;
    const command = current.undo.at(-1) ?? null;
    if (!command) return null;
    set((state) => ({
      documents: {
        ...state.documents,
        [documentId]: { undo: current.undo.slice(0, -1), redo: [...current.redo, command].slice(-30) },
      },
    }));
    return command;
  },
  takeRedo: (documentId) => {
    const current = get().documents[documentId] ?? EMPTY_HISTORY;
    const command = current.redo.at(-1) ?? null;
    if (!command) return null;
    set((state) => ({
      documents: {
        ...state.documents,
        [documentId]: { undo: [...current.undo, command].slice(-30), redo: current.redo.slice(0, -1) },
      },
    }));
    return command;
  },
  rollbackUndo: (documentId, command) => set((state) => {
    const current = state.documents[documentId] ?? EMPTY_HISTORY;
    return {
      documents: {
        ...state.documents,
        [documentId]: { undo: [...current.undo, command].slice(-30), redo: current.redo.filter((entry) => entry !== command) },
      },
    };
  }),
  rollbackRedo: (documentId, command) => set((state) => {
    const current = state.documents[documentId] ?? EMPTY_HISTORY;
    return {
      documents: {
        ...state.documents,
        [documentId]: { undo: current.undo.filter((entry) => entry !== command), redo: [...current.redo, command].slice(-30) },
      },
    };
  }),
  clear: (documentId) => set((state) => ({
    documents: { ...state.documents, [documentId]: EMPTY_HISTORY },
    busy: { ...state.busy, [documentId]: false },
  })),
  setBusy: (documentId, busy) => set((state) => ({ busy: { ...state.busy, [documentId]: busy } })),
  reset: () => set({ documents: {}, busy: {} }),
}));
