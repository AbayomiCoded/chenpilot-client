"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

interface ChatComposerFieldProps {
    value: string;
    onChange: (value: string) => void;
    onSend: () => void;
    onEscape: () => void;
    placeholder?: string;
    disabled?: boolean;
}

export function ChatComposerField({
    value,
    onChange,
    onSend,
    onEscape,
    placeholder,
    disabled = false,
}: ChatComposerFieldProps) {
    const [showShortcuts, setShowShortcuts] = useState(false);
    const isComposingRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const handleGlobalKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            if (
                event.key !== "?" ||
                (target instanceof HTMLElement &&
                    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
            ) {
                return;
            }
            setShowShortcuts(true);
        };

        window.addEventListener("keydown", handleGlobalKeyDown);
        return () => window.removeEventListener("keydown", handleGlobalKeyDown);
    }, []);

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (
            isComposingRef.current ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
        ) {
            return;
        }

        if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            const textarea = event.currentTarget;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const nextValue = `${value.slice(0, start)}\n${value.slice(end)}`;
            onChange(nextValue);
            textarea.setRangeText("\n", start, end, "end");
        } else if (event.key === "Enter") {
            event.preventDefault();
            if (value.trim()) onSend();
        } else if (event.key === "Escape") {
            event.preventDefault();
            textareaRef.current?.blur();
            onEscape();
        }
    };

    return (
        <>
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                aria-label="Message"
                className="w-full resize-y bg-transparent border-none text-white placeholder:text-gray-500 focus:outline-none text-lg mb-2 min-h-8"
            />
            <div className="hidden sm:flex items-center justify-end gap-3 text-xs text-gray-500">
                <span><kbd className="font-mono text-gray-400">Enter</kbd> to send</span>
                <span><kbd className="font-mono text-gray-400">Shift + Enter</kbd> for new line</span>
                <button
                    type="button"
                    onClick={() => setShowShortcuts(true)}
                    aria-label="Show keyboard shortcuts"
                    className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-300 hover:bg-gray-800"
                >
                    ?
                </button>
            </div>
            {showShortcuts && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="chat-shortcuts-title"
                    className="absolute inset-x-6 top-6 z-30 rounded-lg border border-gray-700 bg-gray-950 p-4 shadow-2xl sm:left-auto sm:right-6 sm:w-72"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <h2 id="chat-shortcuts-title" className="text-sm font-medium text-white">Keyboard shortcuts</h2>
                        <button
                            type="button"
                            onClick={() => setShowShortcuts(false)}
                            aria-label="Close keyboard shortcuts"
                            className="px-2 py-1 text-gray-400 hover:text-white"
                        >
                            Close
                        </button>
                    </div>
                    <dl className="space-y-2 text-sm text-gray-300">
                        <div className="flex justify-between gap-4"><dt>Send message</dt><dd className="font-mono text-gray-400">Enter</dd></div>
                        <div className="flex justify-between gap-4"><dt>New line</dt><dd className="font-mono text-gray-400">Shift + Enter</dd></div>
                        <div className="flex justify-between gap-4"><dt>Clear / cancel</dt><dd className="font-mono text-gray-400">Escape</dd></div>
                    </dl>
                </div>
            )}
        </>
    );
}