import { create } from "zustand";

interface SelectionState {
  selectedDocumentId: string | null;
  selectedRowId: string | null;
  linkedRowId: string | null;
  setDocument: (id: string | null) => void;
  setRow: (id: string | null) => void;
  openLinked: (id: string) => void;
  closeLinked: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedDocumentId: null,
  selectedRowId: null,
  linkedRowId: null,
  setDocument: (id) => set({ selectedDocumentId: id, selectedRowId: null, linkedRowId: null }),
  setRow: (id) => set({ selectedRowId: id }),
  openLinked: (id) => set({ linkedRowId: id }),
  closeLinked: () => set({ linkedRowId: null }),
}));
