import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../hooks/useEscapeClose";

export interface MenuEntry {
  key: string;
  label: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  shortcut?: string;
  children?: MenuEntry[];
}

export function Menu({ label, entries, testId }: { label: string; entries: MenuEntry[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useEscapeClose(() => setOpen(false), open);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) setPosition({ left: rect.left, top: rect.bottom + 4 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid={testId}
        className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted ${open ? "bg-muted" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          data-testid={`${testId ?? "menu"}-popover`}
          style={position}
          className="fixed z-[190] min-w-56 rounded-xl border border-border bg-surfaceElevated p-1.5 shadow-2xl"
        >
          <MenuItems entries={entries} onClose={() => setOpen(false)} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function MenuItems({ entries, onClose }: { entries: MenuEntry[]; onClose: () => void }) {
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  return entries.map((entry) => entry.separator ? (
    <div key={entry.key} className="my-1 border-t border-border" />
  ) : (
    <div key={entry.key} className="relative" onMouseEnter={() => setActiveSubmenu(entry.children ? entry.key : null)}>
      <button
        role="menuitem"
        data-testid={`menuitem-${entry.key}`}
        disabled={entry.disabled}
        aria-haspopup={entry.children ? "menu" : undefined}
        aria-expanded={entry.children ? activeSubmenu === entry.key : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40 ${entry.danger ? "text-destructive" : "text-foreground"}`}
        onClick={() => {
          if (entry.children) {
            setActiveSubmenu(entry.key);
            return;
          }
          entry.onSelect?.();
          onClose();
        }}
      >
        <span className="w-4 text-xs">{entry.checked ? "✓" : ""}</span>
        <span className="min-w-0 flex-1">{entry.label}</span>
        {entry.shortcut && <kbd className="shrink-0 text-[10px] text-mutedForeground">{entry.shortcut}</kbd>}
        {entry.children && <ChevronRight size={14} className="shrink-0 text-mutedForeground" />}
      </button>
      {entry.children && activeSubmenu === entry.key && (
        <div role="menu" className="absolute left-full top-0 z-[71] ml-1 min-w-64 rounded-xl border border-border bg-surfaceElevated p-1.5 shadow-2xl">
          <MenuItems entries={entry.children} onClose={onClose} />
        </div>
      )}
    </div>
  ));
}
