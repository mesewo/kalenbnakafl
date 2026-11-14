"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

const storageKey = "kalenbnakafl-theme";
const themeChangedEvent = "kalenbnakafl-theme-change";

function getThemeSnapshot() {
  const setting = document.documentElement.dataset.theme;
  return (
    setting === "dark" ||
    (setting !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

function subscribeToTheme(onChange: () => void) {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(themeChangedEvent, onChange);
  window.addEventListener("storage", onChange);
  preference.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(themeChangedEvent, onChange);
    window.removeEventListener("storage", onChange);
    preference.removeEventListener("change", onChange);
  };
}

export default function ThemeToggle() {
  const t = useTranslations("common");
  const dark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    document.documentElement.dataset.theme =
      savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
    window.dispatchEvent(new Event(themeChangedEvent));
  }, []);

  function toggleTheme() {
    const nextDark = !dark;
    const theme = nextDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
    window.dispatchEvent(new Event(themeChangedEvent));
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={dark ? t("switchToLightTheme") : t("switchToDarkTheme")}
      aria-pressed={dark}
      title={dark ? t("switchToLightTheme") : t("switchToDarkTheme")}
    >
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.9 13A8.5 8.5 0 0 1 11 3.1 8.5 8.5 0 1 0 20.9 13Z" />
        </svg>
      )}
    </button>
  );
}
