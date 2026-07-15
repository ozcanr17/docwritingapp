import { create } from "zustand";

interface SelectionState {
  selectedDocumentId: string | null;
  selectedRowId: string | null;
  selectedRowIds: string[];
  selectionAnchorId: string | null;
  detailRowId: string | null;
  linkedRowId: string | null;
  setDocument: (id: string | null) => void;
  setRow: (id: string | null) => void;
  selectOnly: (id: string) => void;
  toggleRow: (id: string) => void;
  selectRange: (orderedIds: string[], targetId: string) => void;
  selectAll: (ids: string[]) => void;
  clearRows: () => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openLinked: (id: string) => void;
  closeLinked: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedDocumentId: null,
  selectedRowId: null,
  selectedRowIds: [],
  selectionAnchorId: null,
  detailRowId: null,
  linkedRowId: null,
  setDocument: (id) =>
    set({
      selectedDocumentId: id,
      selectedRowId: null,
      selectedRowIds: [],
      selectionAnchorId: null,
      detailRowId: null,
      linkedRowId: null,
    }),
  setRow: (id) => set({ selectedRowId: id, selectedRowIds: id ? [id] : [], selectionAnchorId: id }),
  selectOnly: (id) => set({ selectedRowId: id, selectedRowIds: [id], selectionAnchorId: id }),
  toggleRow: (id) =>
    set((state) => {
      const selectedRowIds = state.selectedRowIds.includes(id)
        ? state.selectedRowIds.filter((rowId) => rowId !== id)
        : [...state.selectedRowIds, id];
      return { selectedRowId: id, selectedRowIds, selectionAnchorId: id };
    }),
  selectRange: (orderedIds, targetId) =>
    set((state) => {
      const anchorId = state.selectionAnchorId ?? targetId;
      const anchorIndex = orderedIds.indexOf(anchorId);
      const targetIndex = orderedIds.indexOf(targetId);
      const start = Math.min(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex);
      const end = Math.max(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex);
      return { selectedRowId: targetId, selectedRowIds: orderedIds.slice(start, end + 1) };
    }),
  selectAll: (ids) => set({ selectedRowId: ids[0] ?? null, selectedRowIds: ids, selectionAnchorId: ids[0] ?? null }),
  clearRows: () => set({ selectedRowId: null, selectedRowIds: [], selectionAnchorId: null }),
  openDetail: (id) => set({ detailRowId: id, selectedRowId: id, selectedRowIds: [id], selectionAnchorId: id }),
  closeDetail: () => set({ detailRowId: null, linkedRowId: null }),
  openLinked: (id) => set({ linkedRowId: id }),
  closeLinked: () => set({ linkedRowId: null }),
}));
