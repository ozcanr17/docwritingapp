export function isDesktopRuntime(): boolean {
  if (import.meta.env.VITE_DESKTOP_MODE === "true") return true;
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}
