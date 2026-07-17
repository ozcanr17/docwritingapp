import { Clock3, FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { DocumentTab } from "../stores/documentTabs";

export function RecentDocumentsDialog({ documents, onClose, onOpen }: { documents: DocumentTab[]; onClose: () => void; onOpen: (document: DocumentTab) => void }) {
  const { t } = useTranslation();
  useEscapeClose(onClose);
  return <div data-testid="recent-documents-dialog" className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/55 p-5" role="dialog" aria-modal="true" aria-label={t("recentDocuments")} onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div><div className="flex items-center gap-2 font-semibold"><Clock3 size={17} />{t("recentDocuments")}</div><p className="mt-1 text-xs text-mutedForeground">{t("recentDocumentsDescription")}</p></div>
        <button type="button" aria-label={t("close")} className="rounded-lg p-1.5 text-mutedForeground hover:bg-muted" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {documents.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-mutedForeground">{t("noRecentDocuments")}</div> : <ol className="space-y-1">{documents.map((document) => <li key={document.id}><button type="button" data-testid={`recent-document-${document.id}`} className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left hover:border-border hover:bg-muted" onClick={() => onOpen(document)}><span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText size={16} /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{document.title}</span><span className="mt-0.5 block text-xs text-mutedForeground">{t(document.documentType === "test" ? "testDocumentShort" : document.documentType === "requirement" ? "requirementDocumentShort" : "documents")}</span></span></button></li>)}</ol>}
      </div>
    </div>
  </div>;
}
