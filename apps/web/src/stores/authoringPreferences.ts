import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RowDensity = "compact" | "standard" | "comfortable";
export type DocumentFontFamily = "system" | "sans" | "serif" | "mono";
export type WorkspaceFocus = "author" | "tester" | "reviewer";

interface AuthoringPreferencesState {
  rowDensity: RowDensity;
  showHierarchyGuides: boolean;
  showChangeIndicators: boolean;
  spellCheck: boolean;
  defaultFrozenColumns: number;
  documentFontSize: number;
  documentFontFamily: DocumentFontFamily;
  highContrast: boolean;
  reduceMotion: boolean;
  notifyMentions: boolean;
  notifyAssignments: boolean;
  notifyReviewRequests: boolean;
  workspaceFocus: WorkspaceFocus;
  setRowDensity: (rowDensity: RowDensity) => void;
  setShowHierarchyGuides: (showHierarchyGuides: boolean) => void;
  setShowChangeIndicators: (showChangeIndicators: boolean) => void;
  setSpellCheck: (spellCheck: boolean) => void;
  setDefaultFrozenColumns: (defaultFrozenColumns: number) => void;
  setDocumentFontSize: (documentFontSize: number) => void;
  setDocumentFontFamily: (documentFontFamily: DocumentFontFamily) => void;
  setHighContrast: (highContrast: boolean) => void;
  setReduceMotion: (reduceMotion: boolean) => void;
  setNotifyMentions: (notifyMentions: boolean) => void;
  setNotifyAssignments: (notifyAssignments: boolean) => void;
  setNotifyReviewRequests: (notifyReviewRequests: boolean) => void;
  setWorkspaceFocus: (workspaceFocus: WorkspaceFocus) => void;
  reset: () => void;
}

const defaults = {
  rowDensity: "standard" as RowDensity,
  showHierarchyGuides: true,
  showChangeIndicators: true,
  spellCheck: true,
  defaultFrozenColumns: 0,
  documentFontSize: 14,
  documentFontFamily: "system" as DocumentFontFamily,
  highContrast: false,
  reduceMotion: false,
  notifyMentions: true,
  notifyAssignments: true,
  notifyReviewRequests: true,
  workspaceFocus: "author" as WorkspaceFocus,
};

export const useAuthoringPreferencesStore = create<AuthoringPreferencesState>()(
  persist(
    (set) => ({
      ...defaults,
      setRowDensity: (rowDensity) => set({ rowDensity }),
      setShowHierarchyGuides: (showHierarchyGuides) => set({ showHierarchyGuides }),
      setShowChangeIndicators: (showChangeIndicators) => set({ showChangeIndicators }),
      setSpellCheck: (spellCheck) => set({ spellCheck }),
      setDefaultFrozenColumns: (defaultFrozenColumns) => set({ defaultFrozenColumns: Math.max(0, Math.min(5, defaultFrozenColumns)) }),
      setDocumentFontSize: (documentFontSize) => set({ documentFontSize: Math.max(12, Math.min(20, documentFontSize)) }),
      setDocumentFontFamily: (documentFontFamily) => set({ documentFontFamily }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setNotifyMentions: (notifyMentions) => set({ notifyMentions }),
      setNotifyAssignments: (notifyAssignments) => set({ notifyAssignments }),
      setNotifyReviewRequests: (notifyReviewRequests) => set({ notifyReviewRequests }),
      setWorkspaceFocus: (workspaceFocus) => set({ workspaceFocus }),
      reset: () => set(defaults),
    }),
    { name: "docsys-authoring-preferences" },
  ),
);

export const documentFontFamilies: Record<DocumentFontFamily, string> = {
  system: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  sans: "Arial, Helvetica, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
