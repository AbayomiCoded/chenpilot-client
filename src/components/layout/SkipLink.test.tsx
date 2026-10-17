import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
    it("moves focus to the main landmark", () => {
        render(
            <>
                <SkipLink />
                <main id="main-content" tabIndex={-1} aria-label="Main content">
                    Page content
                </main>
            </>,
        );

        fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }));

        expect(document.activeElement).toBe(
            screen.getByRole("main", { name: "Main content" }),
        );
    });
});