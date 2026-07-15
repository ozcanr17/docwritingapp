import { create } from "zustand";
import { persist } from "zustand/middleware";
import { MIN_COLUMN_WIDTH } from "../lib/columns";

interface ColumnState {
  hidden: Record<string, string[]>;
  widths: Record<string, Record<string, number>>;
  order: Record<string, string[]>;
  isHidden: (documentId: string, key: string) => boolean;
  toggle: (documentId: string, key: string) => void;
  hide: (documentId: string, key: string) => void;
  show: (documentId: string, key: string) => void;
  place: (documentId: string, key: string, anchorKey: string, side: "left" | "right", allKeys: string[]) => void;
  widthOf: (documentId: string, key: string) => number | undefined;
  setWidth: (documentId: string, key: string, width: number) => void;
}

export const useColumnStore = create<ColumnState>()(
  persist(
    (set, get) => ({
      hidden: {},
      widths: {},
      order: {},
      isHidden: (documentId, key) => (get().hidden[documentId] ?? []).includes(key),
      toggle: (documentId, key) =>
        set((state) => {
          const current = state.hidden[documentId] ?? [];
          const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
          return { hidden: { ...state.hidden, [documentId]: next } };
        }),
      hide: (documentId, key) => set((state) => ({ hidden: { ...state.hidden, [documentId]: [...new Set([...(state.hidden[documentId] ?? []), key])] } })),
      show: (documentId, key) => set((state) => ({ hidden: { ...state.hidden, [documentId]: (state.hidden[documentId] ?? []).filter((item) => item !== key) } })),
      place: (documentId, key, anchorKey, side, allKeys) => set((state) => {
        const saved = state.order[documentId] ?? [];
        const current = [...saved.filter((item) => allKeys.includes(item)), ...allKeys.filter((item) => !saved.includes(item))].filter((item) => item !== key);
        const anchorIndex = current.indexOf(anchorKey);
        const index = anchorIndex === -1 ? current.length : anchorIndex + (side === "right" ? 1 : 0);
        current.splice(index, 0, key);
        return { order: { ...state.order, [documentId]: current } };
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
