import { useToastStore } from "../stores/toasts";

const kindClasses: Record<string, string> = {
  info: "border-info",
  error: "border-destructive",
  success: "border-success",
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`max-w-sm rounded border-l-4 ${kindClasses[toast.kind]} border border-border bg-surfaceElevated px-4 py-2 text-left text-sm shadow-md`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
