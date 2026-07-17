export type ShortcutCommandId =
  | "commandPalette"
  | "globalSearch"
  | "previousDocument"
  | "nextDocument"
  | "closeDocument"
  | "addObject"
  | "addObjectBelow"
  | "addBlankObject"
  | "addBlankObjectBelow"
  | "addTestStep"
  | "openDetails"
  | "openLinks"
  | "indent"
  | "outdent"
  | "expandAll"
  | "collapseAll"
  | "findReplace"
  | "documentSearch"
  | "selectAll"
  | "undo"
  | "redo"
  | "deleteSelection"
  | "selectedRowHistory"
  | "documentHistory"
  | "openSettings";

export interface ShortcutCommandDefinition {
  id: ShortcutCommandId;
  labelKey: string;
  category: "navigation" | "authoring" | "editing" | "workspace";
  scope: "global" | "document" | "row";
}

export const SHORTCUT_COMMANDS: ShortcutCommandDefinition[] = [
  { id: "commandPalette", labelKey: "command.commandPalette", category: "navigation", scope: "global" },
  { id: "globalSearch", labelKey: "command.globalSearch", category: "navigation", scope: "global" },
  { id: "previousDocument", labelKey: "command.previousDocument", category: "navigation", scope: "document" },
  { id: "nextDocument", labelKey: "command.nextDocument", category: "navigation", scope: "document" },
  { id: "closeDocument", labelKey: "command.closeDocument", category: "navigation", scope: "document" },
  { id: "addObject", labelKey: "command.addObject", category: "authoring", scope: "document" },
  { id: "addObjectBelow", labelKey: "command.addObjectBelow", category: "authoring", scope: "row" },
  { id: "addBlankObject", labelKey: "command.addBlankObject", category: "authoring", scope: "document" },
  { id: "addBlankObjectBelow", labelKey: "command.addBlankObjectBelow", category: "authoring", scope: "row" },
  { id: "addTestStep", labelKey: "command.addTestStep", category: "authoring", scope: "document" },
  { id: "openDetails", labelKey: "command.openDetails", category: "navigation", scope: "row" },
  { id: "openLinks", labelKey: "command.openLinks", category: "navigation", scope: "row" },
  { id: "indent", labelKey: "command.indent", category: "authoring", scope: "row" },
  { id: "outdent", labelKey: "command.outdent", category: "authoring", scope: "row" },
  { id: "expandAll", labelKey: "command.expandAll", category: "navigation", scope: "document" },
  { id: "collapseAll", labelKey: "command.collapseAll", category: "navigation", scope: "document" },
  { id: "findReplace", labelKey: "command.findReplace", category: "editing", scope: "document" },
  { id: "documentSearch", labelKey: "command.documentSearch", category: "navigation", scope: "document" },
  { id: "selectAll", labelKey: "command.selectAll", category: "editing", scope: "document" },
  { id: "undo", labelKey: "command.undo", category: "editing", scope: "document" },
  { id: "redo", labelKey: "command.redo", category: "editing", scope: "document" },
  { id: "deleteSelection", labelKey: "command.deleteSelection", category: "editing", scope: "row" },
  { id: "selectedRowHistory", labelKey: "command.selectedRowHistory", category: "editing", scope: "row" },
  { id: "documentHistory", labelKey: "command.documentHistory", category: "editing", scope: "document" },
  { id: "openSettings", labelKey: "command.openSettings", category: "workspace", scope: "global" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutCommandId, string> = {
  commandPalette: "Mod+Shift+P",
  globalSearch: "Mod+K",
  previousDocument: "Ctrl+Shift+Tab",
  nextDocument: "Ctrl+Tab",
  closeDocument: "Mod+W",
  addObject: "Insert",
  addObjectBelow: "Shift+Insert",
  addBlankObject: "Alt+Insert",
  addBlankObjectBelow: "Alt+Shift+Insert",
  addTestStep: "Alt+T",
  openDetails: "Mod+I",
  openLinks: "Mod+L",
  indent: "Tab",
  outdent: "Shift+Tab",
  expandAll: "Mod+Shift+E",
  collapseAll: "Mod+Shift+C",
  findReplace: "Mod+H",
  documentSearch: "Mod+F",
  selectAll: "Mod+A",
  undo: "Mod+Z",
  redo: "Mod+Shift+Z",
  deleteSelection: "Delete",
  selectedRowHistory: "Mod+Shift+H",
  documentHistory: "Mod+Alt+H",
  openSettings: "Mod+,",
};

const isMac = (): boolean => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const normalizedKey = (event: KeyboardEvent): string | null => {
  if (["Meta", "Control", "Alt", "Shift"].includes(event.key)) return null;
  const aliases: Record<string, string> = { " ": "Space", Esc: "Escape", Del: "Delete", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right" };
  if (aliases[event.key]) return aliases[event.key] as string;
  return event.key.length === 1 ? event.key.toUpperCase() : event.key;
};

export function shortcutFromEvent(event: KeyboardEvent): string | null {
  const key = normalizedKey(event);
  if (!key) return null;
  const parts: string[] = [];
  if (isMac() ? event.metaKey : event.ctrlKey) parts.push("Mod");
  if (event.ctrlKey && (isMac() || !parts.includes("Mod"))) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(key);
  return parts.join("+");
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  return Boolean(shortcut) && shortcutFromEvent(event) === shortcut;
}

export function formatShortcut(shortcut: string): string {
  if (!shortcut) return "-";
  if (!isMac()) return shortcut.replace("Mod", "Ctrl");
  return shortcut
    .replace("Mod", "Cmd")
    .replace("Ctrl", "Control")
    .replaceAll("+", " + ");
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}
