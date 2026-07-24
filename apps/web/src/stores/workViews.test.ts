import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkViewsStore } from "./workViews";

describe("work views", () => {
  beforeEach(() => useWorkViewsStore.getState().reset());

  it("stores and removes a project-scoped personal view", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const id = useWorkViewsStore.getState().saveView({
      projectId: "project",
      name: "My release defects",
      tab: "board",
      query: "release",
      mine: true,
      bugsOnly: true,
    });

    expect(id).toBe("00000000-0000-4000-8000-000000000001");
    expect(useWorkViewsStore.getState().views).toEqual([
      expect.objectContaining({
        id,
        projectId: "project",
        tab: "board",
        mine: true,
        bugsOnly: true,
      }),
    ]);

    useWorkViewsStore.getState().removeView(id);
    expect(useWorkViewsStore.getState().views).toEqual([]);
  });
});
