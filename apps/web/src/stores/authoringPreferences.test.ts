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
      workspaceFocus: "reviewer",
    }));
  });

  it("clamps frozen-column defaults and restores defaults", () => {
    useAuthoringPreferencesStore.getState().setDefaultFrozenColumns(99);
    useAuthoringPreferencesStore.getState().setDocumentFontSize(99);
    expect(useAuthoringPreferencesStore.getState().defaultFrozenColumns).toBe(5);
    expect(useAuthoringPreferencesStore.getState().documentFontSize).toBe(20);
    useAuthoringPreferencesStore.getState().reset();
    expect(useAuthoringPreferencesStore.getState()).toEqual(expect.objectContaining({ rowDensity: "standard", defaultFrozenColumns: 1, documentFontSize: 14, documentFontFamily: "system", highContrast: false, workspaceFocus: "author" }));
  });
});
