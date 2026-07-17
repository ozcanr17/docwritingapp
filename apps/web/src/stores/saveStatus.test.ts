import { beforeEach, describe, expect, it } from "vitest";
import { useSaveStatusStore } from "./saveStatus";

describe("save status", () => {
  beforeEach(() => useSaveStatusStore.setState({ documents: {} }));

  it("tracks save state independently for each document", () => {
    const store = useSaveStatusStore.getState();
    store.setStatus("doc-a", "saving");
    store.setStatus("doc-b", "conflict");
    expect(useSaveStatusStore.getState().statusOf("doc-a").state).toBe("saving");
    expect(useSaveStatusStore.getState().statusOf("doc-b").state).toBe("conflict");
    expect(useSaveStatusStore.getState().statusOf("missing").state).toBe("saved");
  });
});
