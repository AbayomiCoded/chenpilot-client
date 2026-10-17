"use client";

export function SkipLink() {
    return (
        <a
            href="#main-content"
            onClick={() => document.getElementById("main-content")?.focus()}
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-white focus:px-4 focus:py-3 focus:text-gray-900 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
            Skip to main content
        </a>
    );
}