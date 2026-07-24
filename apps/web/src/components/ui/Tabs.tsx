import { useRef } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
  testId?: string;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}

export function Tabs({ items, activeId, onChange, label, className = "" }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const focusTab = (index: number) => {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const target = buttons?.[(index + items.length) % items.length];
    target?.focus();
    const item = items[(index + items.length) % items.length];
    if (item) onChange(item.id);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={`flex items-end gap-1 overflow-x-auto border-b border-border ${className}`}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const current = items.findIndex((item) => item.id === activeId);
        if (event.key === "Home") focusTab(0);
        else if (event.key === "End") focusTab(items.length - 1);
        else focusTab(current + (event.key === "ArrowRight" ? 1 : -1));
      }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-testid={item.testId}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors ${
              active ? "border-primary text-primary" : "border-transparent text-mutedForeground hover:border-borderStrong hover:text-foreground"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.icon && <span aria-hidden="true" className="flex items-center">{item.icon}</span>}
            {item.label}
            {typeof item.count === "number" && (
              <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${active ? "bg-primary/10 text-primary" : "bg-muted text-mutedForeground"}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
