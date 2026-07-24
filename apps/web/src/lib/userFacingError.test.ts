import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { userFacingError } from "./userFacingError";

const t = (key: string) => key;

describe("userFacingError", () => {
  it("maps actionable HTTP failures without exposing server payloads", () => {
    expect(userFacingError(new ApiError(403, { stack: "private" }), t)).toBe("operationFailedPermission");
    expect(userFacingError(new ApiError(404, null), t)).toBe("operationFailedNotFound");
    expect(userFacingError(new ApiError(409, null), t)).toBe("conflictError");
    expect(userFacingError(new ApiError(429, null), t)).toBe("operationFailedRateLimit");
  });
});
