import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { Toasts } from "./components/Toasts";
import { DesktopUpdate } from "./components/DesktopUpdate";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const ShellPage = lazy(() => import("./pages/ShellPage").then((module) => ({ default: module.ShellPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export function App() {
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
    </QueryClientProvider>
  );
}

function SkipLink() {
  const { t } = useTranslation();
  return <a className="skip-link" href="#main-content">{t("skipToContent")}</a>;
}

function AppLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-mutedForeground">DocSys</div>;
}
