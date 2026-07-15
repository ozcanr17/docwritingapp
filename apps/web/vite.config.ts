import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ANALYZE === "true"
      ? [visualizer({ filename: "dist/bundle-stats.json", template: "raw-data", gzipSize: true, brotliSize: true })]
      : []),
  ],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (!path.includes("node_modules")) return undefined;
          if (path.includes("i18next") || path.includes("react-i18next")) return "vendor-i18n";
          if (path.includes("@hocuspocus") || path.includes("/yjs@") || path.includes("/y-protocols@") || path.includes("/lib0@")) return "editor-collaboration";
          if (path.includes("/prosemirror-") || path.includes("/y-prosemirror@") || path.includes("/rope-sequence@") || path.includes("/orderedmap@")) return "editor-prosemirror";
          if (path.includes("/@tiptap+")) return "editor-tiptap";
          if (path.includes("/@tanstack+query-") || path.includes("/@tanstack+react-query@")) return "vendor-query";
          if (path.includes("/react@") || path.includes("/react-dom@") || path.includes("/scheduler@") || path.includes("/react-router@") || path.includes("/react-router-dom@") || path.includes("/@remix-run+router@")) return "vendor-react";
          return undefined;
        },
      },
    },
  },
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    globals: true,
  },
});
