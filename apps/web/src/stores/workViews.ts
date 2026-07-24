import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkViewTab = "items" | "board";

export interface WorkView {
  id: string;
  projectId: string;
  name: string;
  tab: WorkViewTab;
  query: string;
  mine: boolean;
  bugsOnly: boolean;
}

interface WorkViewsState {
  views: WorkView[];
  saveView: (view: Omit<WorkView, "id">) => string;
  removeView: (id: string) => void;
  reset: () => void;
}

const createId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `work-view-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const useWorkViewsStore = create<WorkViewsState>()(
  persist(
    (set) => ({
      views: [],
      saveView: (view) => {
        const id = createId();
        set((state) => ({ views: [...state.views, { ...view, id }] }));
        return id;
      },
      removeView: (id) =>
        set((state) => ({
          views: state.views.filter((view) => view.id !== id),
        })),
      reset: () => set({ views: [] }),
    }),
    { name: "docsys-work-views" },
  ),
);
