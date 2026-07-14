import { useEffect, useRef, useState } from "react";

export interface MenuEntry {
  key: string;
  label: string;
  onSelect?: () => void;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
}

export function Menu({ label, entries, testId }: { label: string; entries: MenuEntry[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid={testId}
        className={`rounded px-2.5 py-1 text-sm hover:bg-muted ${open ? "bg-muted" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-0.5 min-w-52 rounded border border-border bg-surfaceElevated py-1 shadow-lg"
        >
          {entries.map((entry) =>
            entry.separator ? (
              <div key={entry.key} className="my-1 border-t border-border" />
            ) : (
              <button
                key={entry.key}
                role="menuitem"
                data-testid={`menuitem-${entry.key}`}
                disabled={entry.disabled}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-40 ${
                  entry.danger ? "text-destructive" : "text-foreground"
                }`}
                onClick={() => {
                  entry.onSelect?.();
                  setOpen(false);
                }}
              >
                <span className="w-4 text-xs">{entry.checked ? "✓" : ""}</span>
                {entry.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
