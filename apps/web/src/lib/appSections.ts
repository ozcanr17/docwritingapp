export const SETTINGS_SECTIONS = [
  "document",
  "appearance",
  "authoring",
  "keyboard",
  "accessibility",
  "notifications",
  "roles",
  "integrations",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const ADMIN_SECTIONS = ["overview", "users", "audit", "feedback"] as const;

export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export const WORK_SECTIONS = ["summary", "board", "list", "plans"] as const;

export type WorkSection = (typeof WORK_SECTIONS)[number];

export function resolveSection<T extends string>(candidate: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(candidate ?? "") ? (candidate as T) : fallback;
}
