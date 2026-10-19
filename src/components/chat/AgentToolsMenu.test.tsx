import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentToolsMenu } from "./AgentToolsMenu";

describe("AgentToolsMenu keyboard interaction", () => {
    it("moves the active option with arrow and Home/End keys", () => {
        render(<AgentToolsMenu selectedTool={null} onSelect={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: "Tools" }));

        const options = screen.getAllByRole("menuitemradio");
        expect(document.activeElement).toBe(options[0]);

        fireEvent.keyDown(options[0], { key: "ArrowDown" });
        expect(document.activeElement).toBe(options[1]);

        fireEvent.keyDown(options[1], { key: "End" });
        expect(document.activeElement).toBe(options[options.length - 1]);

        fireEvent.keyDown(options[options.length - 1], { key: "Home" });
        expect(document.activeElement).toBe(options[0]);
    });

    it("closes on Escape and restores focus to the trigger", () => {
        render(<AgentToolsMenu selectedTool={null} onSelect={vi.fn()} />);

        const trigger = screen.getByRole("button", { name: "Tools" });
        fireEvent.click(trigger);

        const menu = screen.getByRole("menu", { name: "Agent tools" });
        fireEvent.keyDown(screen.getAllByRole("menuitemradio")[0], {
            key: "Escape",
        });

        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(menu.hasAttribute("hidden")).toBe(true);
        expect(document.activeElement).toBe(trigger);
    });

    it("announces the selected tool with aria-checked", () => {
        render(<AgentToolsMenu selectedTool="Blend" onSelect={vi.fn()} />);

        fireEvent.click(screen.getByRole("button", { name: /Tools/ }));

        expect(screen.getByRole("menuitemradio", { name: /Blend/ }).getAttribute("aria-checked")).toBe("true");
        expect(screen.getByRole("menuitemradio", { name: /Soroswap/ }).getAttribute("aria-checked")).toBe("false");
    });
});