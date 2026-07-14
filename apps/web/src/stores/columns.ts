import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MIN_COLUMN_WIDTH } from "../lib/columns";

interface ColumnState {
  hidden: Record<string, string[]>;
  widths: Record<string, Record<string, number>>;
  isHidden: (documentId: string, key: string) => boolean;
  toggle: (documentId: string, key: string) => void;
  widthOf: (documentId: string, key: string) => number | undefined;
  setWidth: (documentId: string, key: string, width: number) => void;
}

export const useColumnStore = create<ColumnState>()(
  persist(
    (set, get) => ({
      hidden: {},
      widths: {},
      isHidden: (documentId, key) => (get().hidden[documentId] ?? []).includes(key),
      toggle: (documentId, key) =>
        set((state) => {
          const current = state.hidden[documentId] ?? [];
          const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
          return { hidden: { ...state.hidden, [documentId]: next } };
        }),
      widthOf: (documentId, key) => get().widths[documentId]?.[key],
      setWidth: (documentId, key, width) =>
        set((state) => ({
          widths: {
            ...state.widths,
            [documentId]: { ...state.widths[documentId], [key]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) },
          },
        })),
    }),
    { name: "docsys-columns" },
  ),
);
