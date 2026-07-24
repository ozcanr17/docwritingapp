import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarGroup, initialsOf } from "./Avatar";
import { Button, IconButton } from "./Button";
import { EmptyState } from "./EmptyState";
import { Lozenge } from "./Lozenge";
import { PageHeader } from "./PageHeader";
import { Tabs } from "./Tabs";

describe("ui primitives", () => {
  it("renders button variants with accessible semantics", () => {
    render(
      <div>
        <Button variant="primary">Save</Button>
        <Button variant="danger">Delete</Button>
        <IconButton label="Close" size="sm">x</IconButton>
      </div>,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("data-variant", "primary");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveAttribute("data-variant", "danger");
    const iconButton = screen.getByRole("button", { name: "Close" });
    expect(iconButton).toHaveAttribute("title", "Close");
    expect(iconButton).toHaveAttribute("type", "button");
  });

  it("derives avatar initials deterministically", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("admin")).toBe("A");
    expect(initialsOf("")).toBe("?");
    render(<Avatar name="Ada Lovelace" />);
    expect(screen.getByRole("img", { name: "Ada Lovelace" })).toHaveTextContent("AL");
  });

  it("caps avatar groups and reports the remainder", () => {
    render(<AvatarGroup names={["A One", "B Two", "C Three", "D Four", "E Five", "F Six"]} max={4} />);
    expect(screen.getAllByRole("img")).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("marks lozenge appearance for status semantics", () => {
    render(<Lozenge appearance="success">Done</Lozenge>);
    expect(screen.getByText("Done")).toHaveAttribute("data-appearance", "success");
  });

  it("supports tab activation by click and keyboard", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="Views"
        activeId="board"
        onChange={onChange}
        items={[
          { id: "list", label: "List", testId: "tab-list" },
          { id: "board", label: "Board", testId: "tab-board", count: 3 },
        ]}
      />,
    );
    const tablist = screen.getByRole("tablist", { name: "Views" });
    expect(screen.getByRole("tab", { name: /Board/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("tab-list"));
    expect(onChange).toHaveBeenCalledWith("list");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("renders page header and empty state content", () => {
    render(
      <div>
        <PageHeader title="Board" description="Track work" actions={<Button>New</Button>} />
        <EmptyState title="Nothing here" description="Create the first item" action={<Button variant="primary">Create</Button>} />
      </div>,
    );
    expect(screen.getByRole("heading", { name: "Board" })).toBeInTheDocument();
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});
