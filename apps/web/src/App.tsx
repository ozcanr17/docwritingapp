import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { Toasts } from "./components/Toasts";
import { DesktopUpdate } from "./components/DesktopUpdate";
import { useAuthoringPreferencesStore } from "./stores/authoringPreferences";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const ShellPage = lazy(() => import("./pages/ShellPage").then((module) => ({ default: module.ShellPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export function App() {
  const highContrast = useAuthoringPreferencesStore((state) => state.highContrast);
  useEffect(() => {
    document.documentElement.classList.toggle("docsys-high-contrast", highContrast);
  }, [highContrast]);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SkipLink />
        <ChunkErrorBoundary>
          <Suspense fallback={<AppLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/*" element={<ShellPage />} />
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </BrowserRouter>
      <Toasts />
      <DesktopUpdate />
      <AutomaticTooltips />
    </QueryClientProvider>
  );
}

function AutomaticTooltips() {
  useEffect(() => {
    const labelFor = (element: HTMLElement) => {
      const accessible = element.getAttribute("aria-label")?.trim();
      if (accessible) return accessible;
      if (element instanceof HTMLSelectElement) return element.selectedOptions[0]?.textContent?.trim() ?? "";
      return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    };
    const enhance = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>("button:not([title]), [role='menuitem']:not([title]), select:not([title])").forEach((element) => {
        const label = labelFor(element);
        if (label) element.title = label;
      });
    };
    enhance(document);
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          if (node.matches("button:not([title]), [role='menuitem']:not([title]), select:not([title])")) {
            const label = labelFor(node);
            if (label) node.title = label;
          }
          enhance(node);
        }
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function SkipLink() {
  const { t } = useTranslation();
  return <a className="skip-link" href="#main-content">{t("skipToContent")}</a>;
}

function AppLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-mutedForeground">DocSys</div>;
}
