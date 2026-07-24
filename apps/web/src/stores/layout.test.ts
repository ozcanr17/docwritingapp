import { beforeEach, describe, expect, it } from "vitest";
import { useLayoutStore } from "./layout";

describe("layout preferences", () => {
  beforeEach(() => useLayoutStore.setState({
    treeWidth: 288,
    sidebarCollapsed: false,
    detailWidth: 360,
    splitDirection: "horizontal",
    splitRatio: 0.5,
  }));

  it("persists an explicit sidebar state and toggles it", () => {
    useLayoutStore.getState().setSidebarCollapsed(true);
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(true);
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().sidebarCollapsed).toBe(false);
  });

  it("keeps resizable panels within supported limits", () => {
    useLayoutStore.getState().setTreeWidth(900);
    useLayoutStore.getState().setDetailWidth(100);
    useLayoutStore.getState().setSplitRatio(0.95);
    expect(useLayoutStore.getState()).toEqual(expect.objectContaining({
      treeWidth: 520,
      detailWidth: 280,
      splitRatio: 0.8,
    }));
  });
});
