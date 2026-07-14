import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toasts } from "./components/Toasts";
import { LoginPage } from "./pages/LoginPage";
import { ShellPage } from "./pages/ShellPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, retry: 1 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<ShellPage />} />
        </Routes>
      </BrowserRouter>
      <Toasts />
    </QueryClientProvider>
  );
}
