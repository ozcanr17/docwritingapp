import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ColumnVisibilityState {
  hidden: Record<string, string[]>;
  isHidden: (documentId: string, key: string) => boolean;
  toggle: (documentId: string, key: string) => void;
}

export const useColumnStore = create<ColumnVisibilityState>()(
  persist(
    (set, get) => ({
      hidden: {},
      isHidden: (documentId, key) => (get().hidden[documentId] ?? []).includes(key),
      toggle: (documentId, key) =>
        set((state) => {
          const current = state.hidden[documentId] ?? [];
          const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
          return { hidden: { ...state.hidden, [documentId]: next } };
        }),
    }),
    { name: "docsys-columns" },
  ),
);
