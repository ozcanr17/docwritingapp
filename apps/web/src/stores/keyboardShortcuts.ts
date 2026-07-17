import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SHORTCUTS, ShortcutCommandId } from "../lib/keyboardShortcuts";

interface KeyboardShortcutsState {
  bindings: Record<ShortcutCommandId, string>;
  setBinding: (commandId: ShortcutCommandId, shortcut: string) => void;
  resetBinding: (commandId: ShortcutCommandId) => void;
  reset: () => void;
}

export const useKeyboardShortcutsStore = create<KeyboardShortcutsState>()(persist((set) => ({
  bindings: { ...DEFAULT_SHORTCUTS },
  setBinding: (commandId, shortcut) => set((state) => {
    const bindings = { ...state.bindings };
    if (shortcut) {
      for (const id of Object.keys(bindings) as ShortcutCommandId[]) {
        if (id !== commandId && bindings[id] === shortcut) bindings[id] = "";
      }
    }
    bindings[commandId] = shortcut;
    return { bindings };
  }),
  resetBinding: (commandId) => set((state) => ({ bindings: { ...state.bindings, [commandId]: DEFAULT_SHORTCUTS[commandId] } })),
  reset: () => set({ bindings: { ...DEFAULT_SHORTCUTS } }),
}), {
  name: "docsys-keyboard-shortcuts",
  version: 1,
}));
