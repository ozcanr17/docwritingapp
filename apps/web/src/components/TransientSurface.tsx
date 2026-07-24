import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscapeClose } from "../hooks/useEscapeClose";

export const transientLayers = {
  popover: "z-[190]",
  modal: "z-[220]",
  notification: "z-[250]",
} as const;

export function useRestoreFocus(enabled = true) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocusRef.current?.focus({ preventScroll: true });
  }, [enabled]);
}

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ModalSurface({
  children,
  onClose,
  labelledBy,
  label,
  testId,
  panelClassName = "",
  align = "center",
  closeOnBackdrop = true,
  role = "dialog",
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  testId?: string;
  panelClassName?: string;
  align?: "center" | "top";
  closeOnBackdrop?: boolean;
  role?: "dialog" | "alertdialog";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEscapeClose(onClose);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const preferred = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], [autofocus]");
      const first = preferred ?? panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${transientLayers.modal} flex bg-black/50 p-4 backdrop-blur-sm ${align === "top" ? "items-start justify-center pt-[8vh]" : "items-center justify-center"}`}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        data-testid={testId}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`min-h-0 overflow-hidden rounded-2xl border border-border bg-surfaceElevated shadow-2xl outline-none ${panelClassName}`}
        onKeyDown={trapFocus}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  pending = false,
  destructive = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <ModalSurface onClose={onClose} labelledBy={titleId} role="alertdialog" panelClassName="w-full max-w-md">
      <div className="p-5">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-mutedForeground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            data-autofocus
            aria-describedby={descriptionId}
            className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${destructive ? "bg-destructive text-white hover:bg-destructive/90" : "bg-primary text-primaryForeground hover:bg-primary/90"}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
