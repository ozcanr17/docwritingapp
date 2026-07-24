import { describe, expect, it } from "vitest";
import { resolveResponsiveLayout } from "./responsiveLayout";

describe("responsive shell layout", () => {
  it("keeps the full desktop workspace at wide widths", () => {
    expect(resolveResponsiveLayout(1440)).toEqual({
      compactSidebar: false,
      overlayDetails: false,
      stackSplit: false,
    });
  });

  it("overlays details before compacting the navigation", () => {
    expect(resolveResponsiveLayout(1100)).toEqual({
      compactSidebar: false,
      overlayDetails: true,
      stackSplit: false,
    });
  });

  it("compacts navigation and stacks split panes in narrow windows", () => {
    expect(resolveResponsiveLayout(760)).toEqual({
      compactSidebar: true,
      overlayDetails: true,
      stackSplit: true,
    });
  });
});
