import { create } from "zustand";

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], message: string, action?: { label: string; onAction: () => void }) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ toasts: [...state.toasts, { id, kind, message, actionLabel: action?.label, onAction: action?.onAction }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, action ? 8000 : 5000);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
