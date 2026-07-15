import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ChunkErrorBoundary } from "./components/ChunkErrorBoundary";
import { Toasts } from "./components/Toasts";

const LoginPage = lazy(() => import("./pages/LoginPage").then((module) => ({ default: module.LoginPage })));
const ShellPage = lazy(() => import("./pages/ShellPage").then((module) => ({ default: module.ShellPage })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
    </QueryClientProvider>
  );
}

function AppLoading() {
  return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-mutedForeground">DocSys</div>;
}
