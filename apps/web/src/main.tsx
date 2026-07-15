import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./lib/i18n";
import "./styles.css";
import { applyTheme, useThemeStore } from "./stores/theme";
import { startPerformanceMonitoring } from "./lib/performance";

applyTheme(useThemeStore.getState().mode);
startPerformanceMonitoring();

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
