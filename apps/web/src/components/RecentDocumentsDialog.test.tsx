import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentDocumentsDialog } from "./RecentDocumentsDialog";

describe("RecentDocumentsDialog", () => {
  const recentDocument = { id: "document-1", title: "System Requirements", documentType: "requirement" as const };

  it("opens a recent document and closes with Escape", () => {
    const onClose = vi.fn();
    const onOpen = vi.fn();
    render(<RecentDocumentsDialog documents={[recentDocument]} onClose={onClose} onOpen={onOpen} />);
    fireEvent.click(screen.getByTestId("recent-document-document-1"));
    expect(onOpen).toHaveBeenCalledWith(recentDocument);
    fireEvent.keyDown(globalThis.document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
