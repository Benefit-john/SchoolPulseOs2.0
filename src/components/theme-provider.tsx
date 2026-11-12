import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "campuspulse-theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => {
    const apply = (next: Theme) => document.documentElement.classList.toggle("dark", next === "dark");
    const saved = readTheme();
    setThemeState(saved);
    apply(saved);
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY && (event.newValue === "dark" || event.newValue === "light")) { setThemeState(event.newValue); apply(event.newValue); } };
    const onTheme = (event: Event) => { const next = (event as CustomEvent<Theme>).detail; if (next === "dark" || next === "light") { setThemeState(next); apply(next); } };
    window.addEventListener("storage", onStorage);
    window.addEventListener("campuspulse-theme", onTheme);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("campuspulse-theme", onTheme); };
  }, []);
  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: (next) => { setThemeState(next); if (typeof window !== "undefined") { window.localStorage.setItem(STORAGE_KEY, next); document.documentElement.classList.toggle("dark", next === "dark"); window.dispatchEvent(new CustomEvent("campuspulse-theme", { detail: next })); } },
    toggleTheme: () => { const next = theme === "dark" ? "light" : "dark"; setThemeState(next); if (typeof window !== "undefined") { window.localStorage.setItem(STORAGE_KEY, next); document.documentElement.classList.toggle("dark", next === "dark"); window.dispatchEvent(new CustomEvent("campuspulse-theme", { detail: next })); } },
  }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
