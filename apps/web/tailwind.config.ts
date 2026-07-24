import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        surfaceElevated: "hsl(var(--surface-elevated))",
        surfaceSubtle: "hsl(var(--surface-subtle))",
        surfaceHover: "hsl(var(--surface-hover))",
        border: "hsl(var(--border))",
        borderStrong: "hsl(var(--border-strong))",
        muted: "hsl(var(--muted))",
        mutedForeground: "hsl(var(--muted-foreground))",
        primary: "hsl(var(--primary))",
        primaryForeground: "hsl(var(--primary-foreground))",
        destructive: "hsl(var(--destructive))",
        warning: "hsl(var(--warning))",
        success: "hsl(var(--success))",
        info: "hsl(var(--info))",
        focusRing: "hsl(var(--focus-ring))",
        selection: "hsl(var(--selection))",
        sidebarBackground: "hsl(var(--sidebar-background))",
        sidebarForeground: "hsl(var(--sidebar-foreground))",
        editorBackground: "hsl(var(--editor-background))",
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.375rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.625rem",
        "2xl": "0.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
