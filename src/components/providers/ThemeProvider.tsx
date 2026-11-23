"use client";

import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { applyTheme } from "@/store/slices/uiSlice";
import { readSavedTheme, resolveTheme } from "@/lib/theme";

/**
 * Keeps the store and the <html> class in sync with the theme preference (#296).
 * The first frame is already themed by THEME_INIT_SCRIPT in the root layout; this provider
 * only syncs Redux and follows system changes while no explicit choice is saved.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.mode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Saved explicit choice wins; otherwise system preference (not persisted)
    dispatch(applyTheme(resolveTheme(readSavedTheme(), mediaQuery.matches)));

    const handleChange = (e: MediaQueryListEvent) => {
      if (!readSavedTheme()) dispatch(applyTheme(e.matches ? "dark" : "light"));
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [dispatch]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    html.classList.toggle("dark", theme === "dark");
    html.style.colorScheme = theme;
  }, [theme]);

  return <>{children}</>;
}
