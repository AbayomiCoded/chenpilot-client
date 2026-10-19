import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean | null>(null);

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;

        const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
        const updatePreference = (event?: MediaQueryListEvent) => {
            setPrefersReducedMotion(event?.matches ?? mediaQuery.matches);
        };

        updatePreference();

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", updatePreference);
            return () => mediaQuery.removeEventListener("change", updatePreference);
        }

        mediaQuery.addListener(updatePreference);
        return () => mediaQuery.removeListener(updatePreference);
    }, []);

    return prefersReducedMotion ?? true;
}