import { useEffect, useRef } from "react";

export interface MenuItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ top: y, left: x }}
      className="fixed z-50 min-w-48 rounded border border-border bg-surfaceElevated py-1 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.key}
          data-testid={`menu-${item.key}`}
          role="menuitem"
          disabled={item.disabled}
          className={`flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-sm hover:bg-muted focus:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${
            item.danger ? "text-destructive" : "text-foreground"
          }`}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          <span>{item.label}</span>
          {item.shortcut && <kbd className="text-[10px] text-mutedForeground">{item.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
