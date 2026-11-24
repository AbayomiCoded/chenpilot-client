/**
 * Theme preference (#296).
 *
 * Precedence: an explicit user choice saved in localStorage (`theme` = "light" | "dark") wins;
 * otherwise the system `prefers-color-scheme` applies. If storage is unavailable or denied,
 * the system preference is used and nothing is persisted.
 */
export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/** Saved explicit preference, or null when none is saved or storage is denied. */
export function readSavedTheme(): ThemeMode | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** Persist an explicit choice; ignored when storage is denied. */
export function saveTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage denied (private mode, blocked cookies): keep the in-memory choice only
  }
}

export function resolveTheme(saved: ThemeMode | null, prefersDark: boolean): ThemeMode {
  return saved ?? (prefersDark ? "dark" : "light");
}

/**
 * Inline script run in <head> before hydration, so the first painted frame already has the
 * right theme. Mirrors `resolveTheme`; must stay dependency-free.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=null;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var r=document.documentElement;if(t==="dark"){r.classList.add("dark")}else{r.classList.remove("dark")}r.style.colorScheme=t}catch(e){}})();`;
