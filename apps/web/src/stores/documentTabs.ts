import { create } from "zustand";
import { DocumentType } from "../lib/api";

export interface DocumentTab {
  id: string;
  title: string;
  documentType: DocumentType;
  pinned?: boolean;
}

interface DocumentTabsState {
  tabs: DocumentTab[];
  activeId: string | null;
  secondaryId: string | null;
  open: (tab: DocumentTab) => void;
  activate: (id: string) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
  setSecondary: (id: string | null) => void;
  update: (tab: DocumentTab) => void;
  togglePin: (id: string) => void;
  reorder: (sourceId: string, targetId: string) => void;
  reset: () => void;
}

export const useDocumentTabsStore = create<DocumentTabsState>((set) => ({
  tabs: [],
  activeId: null,
  secondaryId: null,
  open: (tab) => set((state) => ({ tabs: state.tabs.some((item) => item.id === tab.id) ? state.tabs.map((item) => item.id === tab.id ? { ...tab, pinned: item.pinned } : item) : [...state.tabs, tab], activeId: tab.id, secondaryId: state.secondaryId === tab.id ? null : state.secondaryId })),
  activate: (id) => set((state) => state.tabs.some((tab) => tab.id === id) ? { activeId: id, secondaryId: state.secondaryId === id ? null : state.secondaryId } : state),
  focus: (id) => set((state) => id === state.secondaryId ? { activeId: id, secondaryId: state.activeId } : state.tabs.some((tab) => tab.id === id) ? { activeId: id } : state),
  close: (id) => set((state) => {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const activeId = state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : state.activeId;
    return { tabs, activeId, secondaryId: state.secondaryId === id || state.secondaryId === activeId ? null : state.secondaryId };
  }),
  setSecondary: (id) => set((state) => ({ secondaryId: id && id !== state.activeId && state.tabs.some((tab) => tab.id === id) ? id : null })),
  update: (tab) => set((state) => ({ tabs: state.tabs.map((item) => item.id === tab.id ? { ...tab, pinned: item.pinned } : item) })),
  togglePin: (id) => set((state) => {
    const tabs = state.tabs.map((tab) => tab.id === id ? { ...tab, pinned: !tab.pinned } : tab);
    return { tabs: [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)] };
  }),
  reorder: (sourceId, targetId) => set((state) => {
    const sourceIndex = state.tabs.findIndex((tab) => tab.id === sourceId);
    const targetIndex = state.tabs.findIndex((tab) => tab.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state;
    if (Boolean(state.tabs[sourceIndex]?.pinned) !== Boolean(state.tabs[targetIndex]?.pinned)) return state;
    const tabs = [...state.tabs];
    const [source] = tabs.splice(sourceIndex, 1);
    if (!source) return state;
    tabs.splice(targetIndex, 0, source);
    return { tabs };
  }),
  reset: () => set({ tabs: [], activeId: null, secondaryId: null }),
}));
