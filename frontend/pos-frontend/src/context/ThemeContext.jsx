// src/context/ThemeContext.jsx
//
// Manages the active theme (a1/a2/a3) and mode (light/dark).
// Preferences are saved to localStorage keyed by username so each
// account remembers its own theme independently.
//
// Default: a2-light (Warm Cream — amber/copper on cream background)
//
// Usage:
//   const { theme, mode, setTheme, setMode, toggleMode } = useTheme();

import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext(null);

const THEMES = ["a1", "a2", "a3"];
const MODES  = ["light", "dark"];

const DEFAULT_THEME = "a2";
const DEFAULT_MODE  = "light";

function storageKey() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  return user.username ? `theme_${user.username}` : "theme_default";
}

function loadPreference() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const { theme, mode } = JSON.parse(raw);
      if (THEMES.includes(theme) && MODES.includes(mode)) return { theme, mode };
    }
  } catch {}
  return { theme: DEFAULT_THEME, mode: DEFAULT_MODE };
}

function savePreference(theme, mode) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ theme, mode }));
  } catch {}
}

function applyTheme(theme, mode) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-mode", mode);
}

export function ThemeProvider({ children }) {
  const pref = loadPreference();
  const [theme, setThemeState] = useState(pref.theme);
  const [mode,  setModeState]  = useState(pref.mode);

  // Apply to DOM on mount and whenever theme/mode changes
  useEffect(() => {
    applyTheme(theme, mode);
    savePreference(theme, mode);
  }, [theme, mode]);

  const setTheme = (t) => {
    if (THEMES.includes(t)) setThemeState(t);
  };

  const setMode = (m) => {
    if (MODES.includes(m)) setModeState(m);
  };

  const toggleMode = () => setModeState(m => m === "light" ? "dark" : "light");

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside <ThemeProvider>");
  return ctx;
}