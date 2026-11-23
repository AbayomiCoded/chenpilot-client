import { useEffect, useRef } from "react";

/**
 * Whether an auth failure is terminal, i.e. resubmitting the same password won't help (#253).
 * Credential and validation rejections (HTTP 4xx except 408/429) and unknown failures are
 * terminal. Network errors, timeouts, 408/429 and 5xx are transient: the user can simply resubmit.
 */
export function isTerminalAuthError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; response?: { status?: number } } | null | undefined;
  const status = e?.response?.status;

  if (status !== undefined) {
    if (status === 408 || status === 429 || status >= 500) return false;
    return true;
  }
  if (e?.code === "ERR_NETWORK" || e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") return false;
  if (typeof e?.message === "string" && /network|timeout/i.test(e.message)) return false;
  return true;
}

/**
 * Clear password inputs when the user leaves the page (#253): on unmount (client-side route
 * change), on `pagehide`, and when the page is restored from the back/forward cache
 * (`pageshow` with `persisted`), so a submitted password is never restored into the form.
 * Autocomplete attributes are left alone, so password managers keep working.
 */
export function useClearPasswordOnLeave(clear: () => void): void {
  const clearRef = useRef(clear);
  clearRef.current = clear;

  useEffect(() => {
    const onPageHide = () => clearRef.current();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) clearRef.current();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      clearRef.current();
    };
  }, []);
}
