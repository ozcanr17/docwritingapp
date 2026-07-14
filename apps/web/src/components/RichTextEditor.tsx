import { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Y from "yjs";
import { api, COLLAB_URL } from "../lib/api";

interface RichTextEditorProps {
  documentId: string;
  displayName: string;
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

export function RichTextEditor({ documentId, displayName }: RichTextEditorProps) {
  const { t } = useTranslation();
  const [bundle, setBundle] = useState<CollabBundle | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ydoc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: documentId,
      document: ydoc,
      token: async () => (await api<{ token: string }>("/auth/collab-token")).token,
    });
    const onSynced = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    provider.on("synced", onSynced);
    provider.on("disconnect", onDisconnect);
    setBundle({ ydoc, provider });
    return () => {
      provider.off("synced", onSynced);
      provider.off("disconnect", onDisconnect);
      provider.destroy();
      ydoc.destroy();
      setBundle(null);
      setConnected(false);
    };
  }, [documentId]);

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
        <CollabSurface bundle={bundle} displayName={displayName} />
      ) : (
        <div className="p-6 text-sm text-mutedForeground">{t("loading")}</div>
      )}
    </div>
  );
}

function CollabSurface({ bundle, displayName }: { bundle: CollabBundle; displayName: string }) {
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
          class: "prose prose-sm max-w-none focus:outline-none min-h-full",
          "data-testid": "richtext-surface",
        },
      },
    },
    [bundle],
  );

  return (
    <div className="flex-1 overflow-auto px-6 py-4 text-sm leading-relaxed text-foreground">
      <EditorContent editor={editor} />
    </div>
  );
}
