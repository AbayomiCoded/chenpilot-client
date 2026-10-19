import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FloatingElements from "./floatingelements";

describe("FloatingElements reduced motion", () => {
    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it("omits floating animations when matchMedia requests reduced motion", () => {
        vi.stubGlobal(
            "matchMedia",
            vi.fn().mockImplementation((media: string) => ({
                matches: true,
                media,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
            })),
        );

        const { container } = render(<FloatingElements />);

        expect(
            container.querySelectorAll(
                ".animate-float, .animate-float-delayed, .animate-float-slow",
            ),
        ).toHaveLength(0);
    });
});