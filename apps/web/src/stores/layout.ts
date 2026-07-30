import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BoardSwimlane } from "../lib/api";

interface LayoutState {
  treeWidth: number;
  sidebarCollapsed: boolean;
  detailWidth: number;
  splitDirection: "horizontal" | "vertical";
  splitRatio: number;
  outlineVisible: boolean;
  boardSwimlane: BoardSwimlane | null;
  collapsedLanes: string[];
  setTreeWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setDetailWidth: (width: number) => void;
  setSplitDirection: (direction: "horizontal" | "vertical") => void;
  setSplitRatio: (ratio: number) => void;
  toggleOutline: () => void;
  setBoardSwimlane: (swimlane: BoardSwimlane | null) => void;
  toggleLane: (laneId: string) => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      treeWidth: 288,
      sidebarCollapsed: false,
      detailWidth: 360,
      splitDirection: "horizontal",
      splitRatio: 0.5,
      outlineVisible: false,
      boardSwimlane: null,
      collapsedLanes: [],
      setTreeWidth: (width) => set({ treeWidth: clamp(width, 200, 520) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setDetailWidth: (width) => set({ detailWidth: clamp(width, 280, 640) }),
      setSplitDirection: (splitDirection) => set({ splitDirection }),
      setSplitRatio: (splitRatio) => set({ splitRatio: clamp(splitRatio, 0.2, 0.8) }),
      toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),
      setBoardSwimlane: (boardSwimlane) => set({ boardSwimlane }),
      toggleLane: (laneId) => set((state) => ({
        collapsedLanes: state.collapsedLanes.includes(laneId)
          ? state.collapsedLanes.filter((entry) => entry !== laneId)
          : [...state.collapsedLanes, laneId],
      })),
    }),
    { name: "docsys-layout" },
  ),
);
