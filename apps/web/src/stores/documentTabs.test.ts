import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentTabsStore } from "./documentTabs";

const requirement = { id: "requirement", title: "Requirements", documentType: "requirement" as const };
const test = { id: "test", title: "Tests", documentType: "test" as const };

describe("document tabs", () => {
  beforeEach(() => useDocumentTabsStore.getState().reset());

  it("opens documents once and activates the latest tab", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().open(requirement);
    expect(useDocumentTabsStore.getState().tabs).toHaveLength(2);
    expect(useDocumentTabsStore.getState().activeId).toBe("requirement");
  });

  it("selects a neighboring tab when the active tab closes", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().close("test");
    expect(useDocumentTabsStore.getState().activeId).toBe("requirement");
  });

  it("keeps split view distinct from the active document", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().setSecondary("requirement");
    expect(useDocumentTabsStore.getState().secondaryId).toBe("requirement");
    useDocumentTabsStore.getState().activate("requirement");
    expect(useDocumentTabsStore.getState().secondaryId).toBeNull();
  });

  it("swaps panes when the secondary document receives focus", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().setSecondary("requirement");
    useDocumentTabsStore.getState().focus("requirement");
    expect(useDocumentTabsStore.getState()).toMatchObject({ activeId: "requirement", secondaryId: "test" });
  });

  it("pins tabs ahead of unpinned documents and preserves the state", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().togglePin("test");
    expect(useDocumentTabsStore.getState().tabs.map((tab) => [tab.id, tab.pinned])).toEqual([
      ["test", true],
      ["requirement", undefined],
    ]);
    useDocumentTabsStore.getState().open({ ...test, title: "Updated Tests" });
    expect(useDocumentTabsStore.getState().tabs[0]).toMatchObject({ title: "Updated Tests", pinned: true });
  });

  it("reorders tabs within the same pin group", () => {
    useDocumentTabsStore.getState().open(requirement);
    useDocumentTabsStore.getState().open(test);
    useDocumentTabsStore.getState().reorder("test", "requirement");
    expect(useDocumentTabsStore.getState().tabs.map((tab) => tab.id)).toEqual(["test", "requirement"]);
    useDocumentTabsStore.getState().togglePin("test");
    useDocumentTabsStore.getState().reorder("requirement", "test");
    expect(useDocumentTabsStore.getState().tabs.map((tab) => tab.id)).toEqual(["test", "requirement"]);
  });
});
