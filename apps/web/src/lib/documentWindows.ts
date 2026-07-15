import { isDesktopRuntime } from "./desktop";

export async function openDocumentWindow(documentId: string, title: string): Promise<void> {
  const url = `/?document=${encodeURIComponent(documentId)}`;
  if (isDesktopRuntime()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `document-${documentId}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow(label, { url, title: `DocSys - ${title}`, width: 1280, height: 820, minWidth: 900, minHeight: 620, center: true });
    return;
  }
  window.open(`${window.location.origin}${url}`, `docsys-document-${documentId}`);
}
