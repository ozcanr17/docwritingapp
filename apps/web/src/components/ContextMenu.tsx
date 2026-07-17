import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../hooks/useEscapeClose";

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
  useEscapeClose(onClose);
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(margin, Math.min(x, window.innerWidth - bounds.width - margin));
    const top = y + bounds.height > window.innerHeight - margin
      ? Math.max(margin, y - bounds.height)
      : Math.max(margin, y);
    setPosition({ left, top });
  }, [items.length, x, y]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    ref.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      data-testid="context-menu"
      role="menu"
      style={position}
      className="fixed z-[150] max-h-[calc(100vh-1rem)] min-w-48 overflow-y-auto rounded-xl border border-border bg-surfaceElevated py-1.5 shadow-2xl"
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
    </div>,
    document.body,
  );
}
