import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isDesktopRuntime } from "../lib/desktop";
import { useEscapeClose } from "../hooks/useEscapeClose";

interface AvailableUpdate {
  version: string;
  install: () => Promise<void>;
}

export function DesktopUpdate() {
  const { t } = useTranslation();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  useEscapeClose(() => setUpdate(null), update !== null && !installing);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let active = true;
    void import("@tauri-apps/plugin-updater")
      .then(async ({ check }) => {
        const candidate = await check();
        if (!candidate || !active) return;
        setUpdate({
          version: candidate.version,
          install: async () => {
            await candidate.downloadAndInstall();
            const { relaunch } = await import("@tauri-apps/plugin-process");
            await relaunch();
          },
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!update) return null;
  return (
    <section role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[1000] w-80 rounded-xl border border-border bg-surfaceElevated p-4 shadow-xl">
      <h2 className="font-medium">{t("updateAvailable")}</h2>
      <p className="mt-1 text-sm text-mutedForeground">{t("desktopUpdateDescription", { version: update.version })}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="rounded-lg px-3 py-1.5 text-sm hover:bg-muted" disabled={installing} onClick={() => setUpdate(null)}>
          {t("later")}
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primaryForeground disabled:opacity-60"
          disabled={installing}
          onClick={() => {
            setInstalling(true);
            void update.install().catch(() => setInstalling(false));
          }}
        >
          {installing ? t("installingUpdate") : t("installUpdate")}
        </button>
      </div>
    </section>
  );
}
