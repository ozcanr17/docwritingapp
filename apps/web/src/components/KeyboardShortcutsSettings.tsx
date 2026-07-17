import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatShortcut, shortcutFromEvent, SHORTCUT_COMMANDS, ShortcutCommandId } from "../lib/keyboardShortcuts";
import { useKeyboardShortcutsStore } from "../stores/keyboardShortcuts";

export function KeyboardShortcutsSettings() {
  const { t } = useTranslation();
  const bindings = useKeyboardShortcutsStore((state) => state.bindings);
  const setBinding = useKeyboardShortcutsStore((state) => state.setBinding);
  const reset = useKeyboardShortcutsStore((state) => state.reset);
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<ShortcutCommandId | null>(null);
  const [reassigned, setReassigned] = useState<string | null>(null);
  const commands = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return SHORTCUT_COMMANDS.filter((command) => !normalized || `${t(command.labelKey)} ${t(`shortcutCategory.${command.category}`)} ${formatShortcut(bindings[command.id])}`.toLocaleLowerCase().includes(normalized));
  }, [bindings, query, t]);

  const record = (event: React.KeyboardEvent<HTMLButtonElement>, commandId: ShortcutCommandId) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      setBinding(commandId, "");
      setRecording(null);
      setReassigned(null);
      return;
    }
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (!shortcut) return;
    const conflict = SHORTCUT_COMMANDS.find((command) => command.id !== commandId && bindings[command.id] === shortcut);
    setBinding(commandId, shortcut);
    setRecording(null);
    setReassigned(conflict ? t(conflict.labelKey) : null);
  };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-border bg-editorBackground px-3 py-2 text-sm">
        <Search size={14} className="text-mutedForeground" />
        <input data-testid="shortcut-search" className="min-w-0 flex-1 bg-transparent outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("searchShortcuts")} />
      </label>
      <button type="button" data-testid="reset-shortcuts" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted" onClick={() => { reset(); setReassigned(null); }}><RotateCcw size={14} />{t("restoreDefaults")}</button>
    </div>
    {reassigned && <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">{t("shortcutReassigned", { command: reassigned })}</div>}
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_10rem] border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-mutedForeground"><span>{t("commandLabel")}</span><span>{t("keyboardShortcut")}</span></div>
      <div className="max-h-[48vh] overflow-auto divide-y divide-border">
        {commands.map((command) => <div key={command.id} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-3 px-3 py-2.5">
          <div className="min-w-0"><div className="truncate text-sm font-medium">{t(command.labelKey)}</div><div className="mt-0.5 text-[11px] text-mutedForeground">{t(`shortcutCategory.${command.category}`)}</div></div>
          <button
            type="button"
            data-testid={`shortcut-${command.id}`}
            aria-label={t("recordShortcutFor", { command: t(command.labelKey) })}
            className={`rounded-lg border px-2.5 py-2 text-left font-mono text-xs ${recording === command.id ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/10" : "border-border bg-editorBackground hover:bg-muted"}`}
            onClick={() => { setRecording(command.id); setReassigned(null); }}
            onKeyDown={(event) => recording === command.id && record(event, command.id)}
          >
            {recording === command.id ? t("pressShortcut") : bindings[command.id] ? formatShortcut(bindings[command.id]) : t("unassigned")}
          </button>
        </div>)}
      </div>
    </div>
    <p className="text-xs leading-5 text-mutedForeground">{t("shortcutSettingsHelp")}</p>
  </div>;
}
