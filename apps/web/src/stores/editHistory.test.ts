import { beforeEach, describe, expect, it } from "vitest";
import { useEditHistoryStore } from "./editHistory";

describe("edit history", () => {
  beforeEach(() => useEditHistoryStore.setState({ documents: {}, busy: {} }));

  it("keeps only the latest thirty personal commands", () => {
    for (let index = 0; index < 35; index += 1) {
      useEditHistoryStore.getState().push("doc", { kind: "create", rowId: `row-${index}` });
    }
    const history = useEditHistoryStore.getState().documents.doc;
    expect(history?.undo).toHaveLength(30);
    expect(history?.undo[0]).toMatchObject({ rowId: "row-5" });
  });

  it("moves commands between undo and redo stacks", () => {
    const command = { kind: "delete" as const, rowId: "row-1" };
    useEditHistoryStore.getState().push("doc", command);
    expect(useEditHistoryStore.getState().takeUndo("doc")).toBe(command);
    expect(useEditHistoryStore.getState().documents.doc?.redo).toEqual([command]);
    expect(useEditHistoryStore.getState().takeRedo("doc")).toBe(command);
    expect(useEditHistoryStore.getState().documents.doc?.undo).toEqual([command]);
  });

  it("tracks execution locks independently for each document", () => {
    useEditHistoryStore.getState().setBusy("doc-a", true);
    expect(useEditHistoryStore.getState().busy).toEqual({ "doc-a": true });
    useEditHistoryStore.getState().setBusy("doc-a", false);
    expect(useEditHistoryStore.getState().busy["doc-a"]).toBe(false);
  });

  it("clears history and the execution lock when a document closes", () => {
    useEditHistoryStore.getState().push("doc", { kind: "create", rowId: "row-1" });
    useEditHistoryStore.getState().setBusy("doc", true);
    useEditHistoryStore.getState().clear("doc");
    expect(useEditHistoryStore.getState().documents.doc).toEqual({ undo: [], redo: [] });
    expect(useEditHistoryStore.getState().busy.doc).toBe(false);
  });
});
