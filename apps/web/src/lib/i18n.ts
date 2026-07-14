import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import tr from "../locales/tr.json";

const LANGUAGE_STORAGE_KEY = "docsys-language";

export type AppLanguage = "tr" | "en";

export function storedLanguage(): AppLanguage {
  if (typeof window === "undefined" || typeof window.localStorage?.getItem !== "function") return "tr";
  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return value === "en" ? "en" : "tr";
}

export function setLanguage(language: AppLanguage): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  void i18next.changeLanguage(language);
  document.documentElement.lang = language;
}

void i18next.use(initReactI18next).init({
  resources: {
    tr: { translation: tr },
    en: { translation: en },
  },
  lng: storedLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18next;
