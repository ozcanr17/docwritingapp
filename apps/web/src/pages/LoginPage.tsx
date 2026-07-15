import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api, getApiUrl, getServerAddress, refreshClientConfig, setServerAddress, setSessionToken } from "../lib/api";
import { isDesktopRuntime } from "../lib/desktop";

interface AuthResponse {
  token?: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState("");
  const desktop = isDesktopRuntime();
  const [serverAddress, setServerAddressInput] = useState(getServerAddress());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (desktop) {
        setSessionToken(null);
        setServerAddress(serverAddress);
        await refreshClientConfig();
      }
      let result: AuthResponse;
      if (mode === "register") {
        result = await api<AuthResponse>("/auth/register", {
          method: "POST",
          headers: desktop ? { "X-DocSys-Client": "desktop" } : undefined,
          body: JSON.stringify({ email: identifier, displayName, password }),
        });
      } else {
        result = await api<AuthResponse>("/auth/login", {
          method: "POST",
          headers: desktop ? { "X-DocSys-Client": "desktop" } : undefined,
          body: JSON.stringify({ identifier, password }),
        });
      }
      if (desktop) {
        if (!result.token) throw new Error("Desktop session token missing");
        setSessionToken(result.token);
      }
      navigate("/");
    } catch {
      setError(t(desktop ? "serverOrLoginError" : "genericError"));
    }
  };

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={submit} aria-labelledby="login-title" className="w-full max-w-md rounded-xl border border-border bg-surface p-8 shadow-lg">
        <h1 id="login-title" className="mb-2 text-xl font-semibold">{t("appName")}</h1>
        <p className="mb-6 text-sm text-mutedForeground">{t("loginDescription")}</p>
        {desktop && (
          <label className="mb-3 block text-sm">
            {t("serverAddress")}
            <input
              data-testid="auth-server-address"
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
              value={serverAddress}
              placeholder={t("serverAddressPlaceholder")}
              onChange={(event) => setServerAddressInput(event.target.value)}
              aria-describedby="server-address-help"
            />
            <span id="server-address-help" className="mt-1 block text-xs text-mutedForeground">{t("serverAddressHelp")}</span>
          </label>
        )}
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
          {mode === "login" ? t("usernameOrEmail") : t("email")}
          <input
            data-testid="auth-email"
            type={mode === "login" ? "text" : "email"}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </label>
        <label className="mb-4 block text-sm">
          {t("password")}
          <input
            data-testid="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
        <button
          data-testid="auth-submit"
          type="submit"
          className="w-full rounded bg-primary px-4 py-2 text-primaryForeground"
        >
          {mode === "login" ? t("login") : t("register")}
        </button>
        {mode === "login" && !desktop && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-2 text-center text-xs uppercase tracking-wide text-mutedForeground">{t("orUseSso")}</div>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-sm" value={organizationSlug} placeholder={t("organizationSlug")} onChange={(event) => setOrganizationSlug(event.target.value)} />
              <button type="button" className="rounded border border-border px-3 text-sm hover:bg-muted" disabled={!organizationSlug.trim()} onClick={() => { window.location.href = `${getApiUrl()}/auth/sso/${encodeURIComponent(organizationSlug.trim())}/start`; }}>{t("sso")}</button>
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
    </main>
  );
}
