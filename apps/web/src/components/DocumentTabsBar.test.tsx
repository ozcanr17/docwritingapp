import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocumentTabsBar } from "./DocumentTabsBar";

const tabs = [
  { id: "requirements", title: "Requirements", documentType: "requirement" as const },
  { id: "tests", title: "Tests", documentType: "test" as const },
];

const splitProps = {
  splitDirection: "horizontal" as const,
  onSplitDirectionChange: vi.fn(),
};

describe("DocumentTabsBar", () => {
  it("activates, closes and splits open documents", () => {
    const activate = vi.fn();
    const close = vi.fn();
    const split = vi.fn();
    render(<DocumentTabsBar {...splitProps} tabs={tabs} activeId="requirements" primaryId="requirements" secondaryId={null} onActivate={activate} onClose={close} onSecondaryChange={split} onOpenWindow={vi.fn()} onTogglePin={vi.fn()} onReorder={vi.fn()} />);
    fireEvent.click(screen.getByTestId("document-tab-tests"));
    expect(activate).toHaveBeenCalledWith("tests");
    fireEvent.contextMenu(screen.getByTestId("document-tab-tests"), { clientX: 120, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-split"));
    expect(split).toHaveBeenCalledWith("tests");
    fireEvent.click(screen.getByTestId("close-document-tab-tests"));
    expect(close).toHaveBeenCalledWith("tests");
  });

  it("opens split and window actions from each tab", () => {
    const split = vi.fn();
    const openWindow = vi.fn();
    const togglePin = vi.fn();
    render(<DocumentTabsBar {...splitProps} tabs={tabs} activeId="requirements" primaryId="requirements" secondaryId={null} onActivate={vi.fn()} onClose={vi.fn()} onSecondaryChange={split} onOpenWindow={openWindow} onTogglePin={togglePin} onReorder={vi.fn()} />);
    fireEvent.contextMenu(screen.getByTestId("document-tab-tests"), { clientX: 120, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-split"));
    expect(split).toHaveBeenCalledWith("tests");
    fireEvent.contextMenu(screen.getByTestId("document-tab-tests"), { clientX: 120, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-window"));
    expect(openWindow).toHaveBeenCalledWith("tests");
    fireEvent.contextMenu(screen.getByTestId("document-tab-tests"), { clientX: 120, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-pin"));
    expect(togglePin).toHaveBeenCalledWith("tests");
  });

  it("does not render an options button and supports keyboard context menus", () => {
    render(<DocumentTabsBar {...splitProps} tabs={tabs} activeId="requirements" primaryId="requirements" secondaryId={null} onActivate={vi.fn()} onClose={vi.fn()} onSecondaryChange={vi.fn()} onOpenWindow={vi.fn()} onTogglePin={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.queryByTestId("document-tab-options-tests")).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("document-tab-tests"), { key: "F10", shiftKey: true });
    expect(screen.getByTestId("menu-window")).toBeInTheDocument();
  });

  it("switches between side-by-side and stacked split layouts", () => {
    const changeDirection = vi.fn();
    render(<DocumentTabsBar {...splitProps} splitDirection="horizontal" onSplitDirectionChange={changeDirection} tabs={tabs} activeId="tests" primaryId="requirements" secondaryId="tests" onActivate={vi.fn()} onClose={vi.fn()} onSecondaryChange={vi.fn()} onOpenWindow={vi.fn()} onTogglePin={vi.fn()} onReorder={vi.fn()} />);
    fireEvent.contextMenu(screen.getByTestId("document-tab-tests"), { clientX: 120, clientY: 40 });
    fireEvent.click(screen.getByTestId("menu-split-vertical"));
    expect(changeDirection).toHaveBeenCalledWith("vertical");
  });
});
