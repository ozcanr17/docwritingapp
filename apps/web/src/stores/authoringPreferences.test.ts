import { beforeEach, describe, expect, it } from "vitest";
import { useAuthoringPreferencesStore } from "./authoringPreferences";

describe("authoring preferences", () => {
  beforeEach(() => useAuthoringPreferencesStore.getState().reset());

  it("updates document density and editing cues", () => {
    const state = useAuthoringPreferencesStore.getState();
    state.setRowDensity("compact");
    state.setShowHierarchyGuides(false);
    state.setShowChangeIndicators(false);
    state.setSpellCheck(false);
    state.setDefaultFrozenColumns(3);
    state.setDocumentFontSize(16);
    state.setDocumentFontFamily("serif");
    state.setHighContrast(true);
    state.setReduceMotion(true);
    state.setNotifyMentions(false);
    state.setNotifyAssignments(false);
    state.setNotifyReviewRequests(false);
    state.setWorkspaceFocus("reviewer");
    expect(useAuthoringPreferencesStore.getState()).toEqual(expect.objectContaining({
      rowDensity: "compact",
      showHierarchyGuides: false,
      showChangeIndicators: false,
      spellCheck: false,
      defaultFrozenColumns: 3,
      documentFontSize: 16,
      documentFontFamily: "serif",
      highContrast: true,
      reduceMotion: true,
      notifyMentions: false,
      notifyAssignments: false,
      notifyReviewRequests: false,
      workspaceFocus: "reviewer",
    }));
  });

  it("clamps frozen-column defaults and restores defaults", () => {
    useAuthoringPreferencesStore.getState().setDefaultFrozenColumns(99);
    useAuthoringPreferencesStore.getState().setDocumentFontSize(99);
    expect(useAuthoringPreferencesStore.getState().defaultFrozenColumns).toBe(5);
    expect(useAuthoringPreferencesStore.getState().documentFontSize).toBe(20);
    useAuthoringPreferencesStore.getState().reset();
    expect(useAuthoringPreferencesStore.getState()).toEqual(expect.objectContaining({ rowDensity: "standard", defaultFrozenColumns: 0, documentFontSize: 14, documentFontFamily: "system", highContrast: false, reduceMotion: false, notifyMentions: true, notifyAssignments: true, notifyReviewRequests: true, workspaceFocus: "author" }));
  });
});
