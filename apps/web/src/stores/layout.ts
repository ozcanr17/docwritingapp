import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  treeWidth: number;
  detailWidth: number;
  setTreeWidth: (width: number) => void;
  setDetailWidth: (width: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      treeWidth: 288,
      detailWidth: 360,
      setTreeWidth: (width) => set({ treeWidth: clamp(width, 200, 520) }),
      setDetailWidth: (width) => set({ detailWidth: clamp(width, 280, 640) }),
    }),
    { name: "docsys-layout" },
  ),
);
