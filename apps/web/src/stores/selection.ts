import { create } from "zustand";

interface SelectionState {
  selectedDocumentId: string | null;
  selectedRowId: string | null;
  detailRowId: string | null;
  linkedRowId: string | null;
  setDocument: (id: string | null) => void;
  setRow: (id: string | null) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openLinked: (id: string) => void;
  closeLinked: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedDocumentId: null,
  selectedRowId: null,
  detailRowId: null,
  linkedRowId: null,
  setDocument: (id) => set({ selectedDocumentId: id, selectedRowId: null, detailRowId: null, linkedRowId: null }),
  setRow: (id) => set({ selectedRowId: id }),
  openDetail: (id) => set({ detailRowId: id, selectedRowId: id }),
  closeDetail: () => set({ detailRowId: null, linkedRowId: null }),
  openLinked: (id) => set({ linkedRowId: id }),
  closeLinked: () => set({ linkedRowId: null }),
}));
