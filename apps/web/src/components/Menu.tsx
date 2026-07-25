import { ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { transientLayers, useRestoreFocus } from "./TransientSurface";

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

export function Menu({ label, entries, testId, icon, triggerClassName }: { label: string; entries: MenuEntry[]; testId?: string; icon?: React.ReactNode; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight?: number }>({ left: 0, top: 0 });
  const hasSubmenus = entries.some((entry) => entry.children !== undefined);
  useEscapeClose(() => setOpen(false), open);
  useRestoreFocus(open);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const update = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 8;
      const panel = panelRef.current;
      const panelWidth = panel?.offsetWidth ?? 224;
      const panelHeight = panel?.offsetHeight ?? 0;
      const maxLeft = window.innerWidth - panelWidth - margin;
      const left = Math.max(margin, Math.min(rect.left, maxLeft));
      const below = rect.bottom + 4;
      const fitsBelow = below + panelHeight + margin <= window.innerHeight;
      const top = fitsBelow || panelHeight === 0
        ? below
        : Math.max(margin, rect.top - 4 - panelHeight);
      const maxHeight = Math.max(160, window.innerHeight - top - margin);
      setPosition({ left, top, maxHeight });
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(frame);
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
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName ?? (icon
          ? `inline-flex h-8 w-8 items-center justify-center rounded-md text-mutedForeground transition-colors hover:bg-muted hover:text-foreground ${open ? "bg-muted text-foreground" : ""}`
          : `rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-muted ${open ? "bg-muted" : ""}`)}
        onClick={() => setOpen((v) => !v)}
      >
        {icon ?? label}
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          role="menu"
          data-testid={`${testId ?? "menu"}-popover`}
          style={{ left: position.left, top: position.top, maxHeight: hasSubmenus ? undefined : position.maxHeight }}
          className={`fixed ${transientLayers.popover} min-w-56 max-w-[min(20rem,calc(100vw-1rem))] rounded-xl border border-border bg-surfaceElevated p-1.5 shadow-2xl ${hasSubmenus ? "" : "overflow-y-auto overflow-x-hidden"}`}
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
  const [flipSubmenu, setFlipSubmenu] = useState(false);
  const openSubmenu = (element: HTMLElement, key: string) => {
    const rect = element.getBoundingClientRect();
    setFlipSubmenu(rect.right + 272 > window.innerWidth);
    setActiveSubmenu(key);
  };
  return entries.map((entry) => entry.separator ? (
    <div key={entry.key} className="my-1 border-t border-border" />
  ) : (
    <div
      key={entry.key}
      className="relative"
      onMouseEnter={(event) => {
        if (entry.children) openSubmenu(event.currentTarget, entry.key);
        else setActiveSubmenu(null);
      }}
    >
      <button
        role="menuitem"
        data-testid={`menuitem-${entry.key}`}
        disabled={entry.disabled}
        aria-haspopup={entry.children ? "menu" : undefined}
        aria-expanded={entry.children ? activeSubmenu === entry.key : undefined}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40 ${entry.danger ? "text-destructive" : "text-foreground"}`}
        onClick={(event) => {
          if (entry.children) {
            openSubmenu(event.currentTarget.parentElement ?? event.currentTarget, entry.key);
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
        <div role="menu" className={`absolute top-0 ${transientLayers.popover} max-h-[min(24rem,70vh)] min-w-64 max-w-[min(17rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-border bg-surfaceElevated p-1.5 shadow-2xl ${flipSubmenu ? "right-full mr-1" : "left-full ml-1"}`}>
          <MenuItems entries={entry.children} onClose={onClose} />
        </div>
      )}
    </div>
  ));
}
