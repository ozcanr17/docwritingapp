import { create } from "zustand";
import { persist } from "zustand/middleware";
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
  focusedId: string | null;
  recentDocuments: DocumentTab[];
  favoriteDocuments: DocumentTab[];
  open: (tab: DocumentTab) => void;
  activate: (id: string) => void;
  focus: (id: string) => void;
  close: (id: string) => void;
  setSecondary: (id: string | null) => void;
  update: (tab: DocumentTab) => void;
  togglePin: (id: string) => void;
  toggleFavorite: (tab: DocumentTab) => void;
  reorder: (sourceId: string, targetId: string) => void;
  reset: () => void;
}

const compactTab = (tab: DocumentTab): DocumentTab => ({
  id: tab.id,
  title: tab.title,
  documentType: tab.documentType,
});

export const useDocumentTabsStore = create<DocumentTabsState>()(persist((set) => ({
  tabs: [],
  activeId: null,
  secondaryId: null,
  focusedId: null,
  recentDocuments: [],
  favoriteDocuments: [],
  open: (tab) => set((state) => {
    const tabs = state.tabs.some((item) => item.id === tab.id)
      ? state.tabs.map((item) => item.id === tab.id ? { ...tab, pinned: item.pinned } : item)
      : [...state.tabs, tab];
    const recentDocuments = [compactTab(tab), ...state.recentDocuments.filter((item) => item.id !== tab.id)].slice(0, 10);
    if (state.secondaryId === tab.id) return { tabs, focusedId: tab.id, recentDocuments };
    return { tabs, activeId: tab.id, focusedId: tab.id, recentDocuments };
  }),
  activate: (id) => set((state) => {
    const tab = state.tabs.find((item) => item.id === id);
    if (!tab) return state;
    const recentDocuments = [compactTab(tab), ...state.recentDocuments.filter((item) => item.id !== id)].slice(0, 10);
    if (state.secondaryId === id) return { focusedId: id, recentDocuments };
    return { activeId: id, focusedId: id, recentDocuments };
  }),
  focus: (id) => set((state) => id === state.activeId || id === state.secondaryId ? { focusedId: id } : state),
  close: (id) => set((state) => {
    const index = state.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return state;
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const activeId = state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : state.activeId;
    const secondaryId = state.secondaryId === id || state.secondaryId === activeId ? null : state.secondaryId;
    const focusedId = state.focusedId === id
      ? activeId ?? secondaryId
      : state.focusedId;
    return { tabs, activeId, secondaryId, focusedId };
  }),
  setSecondary: (id) => set((state) => {
    const secondaryId = id && id !== state.activeId && state.tabs.some((tab) => tab.id === id) ? id : null;
    return { secondaryId, focusedId: secondaryId ?? state.activeId };
  }),
  update: (tab) => set((state) => ({
    tabs: state.tabs.map((item) => item.id === tab.id ? { ...tab, pinned: item.pinned } : item),
    recentDocuments: state.recentDocuments.map((item) => item.id === tab.id ? compactTab(tab) : item),
    favoriteDocuments: state.favoriteDocuments.map((item) => item.id === tab.id ? compactTab(tab) : item),
  })),
  togglePin: (id) => set((state) => {
    const tabs = state.tabs.map((tab) => tab.id === id ? { ...tab, pinned: !tab.pinned } : tab);
    return { tabs: [...tabs.filter((tab) => tab.pinned), ...tabs.filter((tab) => !tab.pinned)] };
  }),
  toggleFavorite: (tab) => set((state) => ({
    favoriteDocuments: state.favoriteDocuments.some((item) => item.id === tab.id)
      ? state.favoriteDocuments.filter((item) => item.id !== tab.id)
      : [compactTab(tab), ...state.favoriteDocuments],
  })),
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
  reset: () => set({
    tabs: [],
    activeId: null,
    secondaryId: null,
    focusedId: null,
    recentDocuments: [],
    favoriteDocuments: [],
  }),
}), {
  name: "docsys-document-workspace",
  version: 1,
}));
