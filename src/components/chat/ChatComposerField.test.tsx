import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposerField } from "./ChatComposerField";

function renderComposer(onSend = vi.fn()) {
    const onEscape = vi.fn();

    function ControlledComposer() {
        const [value, setValue] = useState("first line");
        return (
            <ChatComposerField
                value={value}
                onChange={setValue}
                onSend={onSend}
                onEscape={onEscape}
            />
        );
    }

    render(<ControlledComposer />);
    return { onEscape, onSend, textarea: screen.getByRole("textbox", { name: "Message" }) };
}

describe("ChatComposerField", () => {
    it("allows Shift+Enter to insert a newline and Enter to send", () => {
        const { onSend, textarea } = renderComposer();

        fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
        expect(textarea).toHaveValue("first line\n");
        expect(onSend).not.toHaveBeenCalled();

        fireEvent.keyDown(textarea, { key: "Enter" });
        expect(onSend).toHaveBeenCalledOnce();
    });

    it("ignores shortcuts throughout an IME composition session", () => {
        const { onEscape, onSend, textarea } = renderComposer();

        fireEvent.compositionStart(textarea);
        fireEvent.keyDown(textarea, { key: "Enter" });
        fireEvent.keyDown(textarea, { key: "Escape" });

        expect(onSend).not.toHaveBeenCalled();
        expect(onEscape).not.toHaveBeenCalled();

        fireEvent.compositionEnd(textarea);
        fireEvent.keyDown(textarea, { key: "Enter" });
        expect(onSend).toHaveBeenCalledOnce();
    });
});