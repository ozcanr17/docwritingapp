import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code2, Heading1, Heading2, Italic, List, ListOrdered, Quote, Redo2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Y from "yjs";
import { api, getCollabUrl } from "../lib/api";
import { documentFontFamilies, useAuthoringPreferencesStore } from "../stores/authoringPreferences";
import { useSaveStatusStore } from "../stores/saveStatus";

interface RichTextEditorProps {
  documentId: string;
  displayName: string;
  readOnly?: boolean;
}

interface CollabBundle {
  ydoc: Y.Doc;
  provider: HocuspocusProvider;
}

const CURSOR_COLORS = ["#2563eb", "#16a34a", "#db2777", "#d97706", "#7c3aed", "#0891b2"];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length] as string;
}

export function RichTextEditor({ documentId, displayName, readOnly = false }: RichTextEditorProps) {
  const { t } = useTranslation();
  const [bundle, setBundle] = useState<CollabBundle | null>(null);
  const [connected, setConnected] = useState(false);
  const setSaveStatus = useSaveStatusStore((state) => state.setStatus);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: getCollabUrl(),
      name: documentId,
      document: ydoc,
      token: async () => (await api<{ token: string }>("/auth/collab-token")).token,
    });
    let savedTimer: ReturnType<typeof setTimeout> | null = null;
    const onSynced = () => { setConnected(true); setSaveStatus(documentId, "saved"); };
    const onDisconnect = () => { setConnected(false); setSaveStatus(documentId, "offline"); };
    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin !== provider) setSaveStatus(documentId, "saving");
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => setSaveStatus(documentId, navigator.onLine ? "saved" : "offline"), 600);
    };
    provider.on("synced", onSynced);
    provider.on("disconnect", onDisconnect);
    ydoc.on("update", onUpdate);
    setBundle({ ydoc, provider });
    return () => {
      provider.off("synced", onSynced);
      provider.off("disconnect", onDisconnect);
      ydoc.off("update", onUpdate);
      if (savedTimer) clearTimeout(savedTimer);
      provider.destroy();
      ydoc.destroy();
      setBundle(null);
      setConnected(false);
    };
  }, [documentId, setSaveStatus]);

  return (
    <div className="flex h-full flex-col bg-editorBackground">
      <div className="flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs text-mutedForeground">
        <span
          data-testid="collab-status"
          className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
        />
        {connected ? t("connected") : t("connecting")}
      </div>
      {bundle ? (
        <CollabSurface bundle={bundle} displayName={displayName} readOnly={readOnly} />
      ) : (
        <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>
      )}
    </div>
  );
}

function CollabSurface({ bundle, displayName, readOnly }: { bundle: CollabBundle; displayName: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const documentFontSize = useAuthoringPreferencesStore((state) => state.documentFontSize);
  const documentFontFamily = useAuthoringPreferencesStore((state) => state.documentFontFamily);
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: bundle.ydoc }),
        CollaborationCursor.configure({
          provider: bundle.provider,
          user: { name: displayName, color: colorFor(displayName) },
        }),
      ],
      editorProps: {
        attributes: {
          class: "prose prose-sm min-h-[60vh] max-w-none focus:outline-none",
          "data-testid": "richtext-surface",
          spellcheck: "true",
        },
      },
      editable: !readOnly,
    },
    [bundle],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!readOnly && <div role="toolbar" aria-label={t("editorToolbar")} className="flex min-h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-surface/90 px-2 py-1 [scrollbar-width:thin]">
        <EditorButton label={t("bold")} active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14} /></EditorButton>
        <EditorButton label={t("italic")} active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14} /></EditorButton>
        <EditorButton label={t("headingLevel", { level: 1 })} active={editor?.isActive("heading", { level: 1 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></EditorButton>
        <EditorButton label={t("headingLevel", { level: 2 })} active={editor?.isActive("heading", { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></EditorButton>
        <span className="mx-1 h-5 border-l border-border" />
        <EditorButton label={t("bulletList")} active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></EditorButton>
        <EditorButton label={t("orderedList")} active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></EditorButton>
        <EditorButton label={t("blockquote")} active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={15} /></EditorButton>
        <EditorButton label={t("codeBlock")} active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 size={15} /></EditorButton>
        <span className="mx-1 h-5 border-l border-border" />
        <EditorButton label={t("undoLastChange")} disabled={!editor?.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={15} /></EditorButton>
        <EditorButton label={t("redoLastChange")} disabled={!editor?.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={15} /></EditorButton>
      </div>}
      <div className="flex-1 overflow-auto bg-editorBackground px-4 py-5 leading-relaxed text-foreground sm:px-8" style={{ fontFamily: documentFontFamilies[documentFontFamily], fontSize: documentFontSize }}>
        <div className="mx-auto min-h-full max-w-4xl rounded-xl border border-border bg-surface px-6 py-8 shadow-sm sm:px-10">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function EditorButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} className={`shrink-0 rounded-md p-1.5 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-35 ${active ? "bg-primary/10 text-primary" : "text-mutedForeground"}`} onClick={onClick}>
      {children}
    </button>
  );
}
