import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, DocumentSummary, DocumentType } from "../lib/api";
import { useToastStore } from "../stores/toasts";
import { ModalSurface } from "./TransientSurface";
import { Button } from "./ui";

export function CreateDocumentDialog({
  workspaceId,
  documentType,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  documentType: DocumentType;
  onClose: () => void;
  onCreated: (document: DocumentSummary) => void;
}) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => api<DocumentSummary>(`/workspaces/${workspaceId}/documents`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), documentType, folderId: null }),
    }),
    onSuccess: (document) => onCreated(document),
    onError: () => pushToast("error", t("genericError")),
  });
  const heading = documentType === "test" ? t("newTestDocument") : t("newRequirementDocument");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || create.isPending) return;
    create.mutate();
  };
  return (
    <ModalSurface onClose={onClose} labelledBy="create-document-title" testId="create-document-dialog" panelClassName="w-full max-w-md p-5">
      <form onSubmit={submit}>
        <div className="flex items-center justify-between">
          <h2 id="create-document-title" className="font-semibold">{heading}</h2>
          <button type="button" aria-label={t("close")} className="rounded-md p-1.5 hover:bg-muted" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-mutedForeground">{t("name")}</span>
          <input
            autoFocus
            data-testid="create-document-name"
            className="mt-1.5 w-full rounded-md border border-border bg-editorBackground px-3 py-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>{t("cancel")}</Button>
          <Button variant="primary" type="submit" data-testid="create-document-submit" disabled={!title.trim() || create.isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </ModalSurface>
  );
}
