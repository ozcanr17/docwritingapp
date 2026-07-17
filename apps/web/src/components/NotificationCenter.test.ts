import { describe, expect, it } from "vitest";
import { notificationPriority } from "./NotificationCenter";

describe("notification priority", () => {
  it("separates action, update and routine events", () => {
    expect(notificationPriority("review_requested")).toBe("action");
    expect(notificationPriority("mention")).toBe("update");
    expect(notificationPriority("export_completed")).toBe("routine");
  });
});
