import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api, API_URL } from "../lib/api";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "register") {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, displayName, password }),
        });
      } else {
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      }
      navigate("/");
    } catch {
      setError(t("genericError"));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={submit} className="w-96 rounded border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold">{t("appName")}</h1>
        {mode === "register" && (
          <label className="mb-3 block text-sm">
            {t("displayName")}
            <input
              data-testid="auth-display-name"
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
        )}
        <label className="mb-3 block text-sm">
          {t("email")}
          <input
            data-testid="auth-email"
            type="email"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block text-sm">
          {t("password")}
          <input
            data-testid="auth-password"
            type="password"
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <button
          data-testid="auth-submit"
          type="submit"
          className="w-full rounded bg-primary px-4 py-2 text-primaryForeground"
        >
          {mode === "login" ? t("login") : t("register")}
        </button>
        {mode === "login" && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-2 text-center text-xs uppercase tracking-wide text-mutedForeground">{t("orUseSso")}</div>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm" value={organizationSlug} placeholder={t("organizationSlug")} onChange={(event) => setOrganizationSlug(event.target.value)} />
              <button type="button" className="rounded border border-border px-3 text-sm hover:bg-muted" disabled={!organizationSlug.trim()} onClick={() => { window.location.href = `${API_URL}/auth/sso/${encodeURIComponent(organizationSlug.trim())}/start`; }}>{t("sso")}</button>
            </div>
          </div>
        )}
        <button
          data-testid="auth-toggle"
          type="button"
          className="mt-3 w-full text-sm text-mutedForeground hover:text-foreground"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? t("register") : t("login")}
        </button>
      </form>
    </div>
  );
}
