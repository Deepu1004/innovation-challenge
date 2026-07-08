import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Mode = "light" | "dark";
interface Ctx { mode: Mode; dark: boolean; toggle: () => void }
const ThemeCtx = createContext<Ctx>({ mode: "light", dark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("ix-theme") as Mode | null;
    if (saved) return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    localStorage.setItem("ix-theme", mode);
  }, [mode]);
  return (
    <ThemeCtx.Provider value={{ mode, dark: mode === "dark", toggle: () => setMode((m) => (m === "dark" ? "light" : "dark")) }}>
      {children}
    </ThemeCtx.Provider>
  );
}
export const useTheme = () => useContext(ThemeCtx);
