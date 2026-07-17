import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LayoutState {
  treeWidth: number;
  detailWidth: number;
  splitDirection: "horizontal" | "vertical";
  splitRatio: number;
  setTreeWidth: (width: number) => void;
  setDetailWidth: (width: number) => void;
  setSplitDirection: (direction: "horizontal" | "vertical") => void;
  setSplitRatio: (ratio: number) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      treeWidth: 288,
      detailWidth: 360,
      splitDirection: "horizontal",
      splitRatio: 0.5,
      setTreeWidth: (width) => set({ treeWidth: clamp(width, 200, 520) }),
      setDetailWidth: (width) => set({ detailWidth: clamp(width, 280, 640) }),
      setSplitDirection: (splitDirection) => set({ splitDirection }),
      setSplitRatio: (splitRatio) => set({ splitRatio: clamp(splitRatio, 0.2, 0.8) }),
    }),
    { name: "docsys-layout" },
  ),
);
