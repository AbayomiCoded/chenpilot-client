# Code Block Copy Behavior (#268)

`CodeBlock` (`src/components/chat/CodeBlock.tsx`) copies a code block's raw text, not the highlighted HTML.

1. **Await the write.** `writeToClipboard` calls `navigator.clipboard.writeText` and resolves only after the browser confirms the write. No feedback is shown before then.
2. **Success:** the button turns into a check labelled "Copied", and "Code copied to clipboard" is announced through a polite live region. Both reset after 2 seconds.
3. **Failure** (permission denied, Clipboard API missing in insecure/HTTP contexts or older browsers, or any rejection):
   - the button shows an error icon
   - the code text is **selected** (`selectElementText`)
   - a visible message says: "Couldn't copy automatically. The code is selected; press Ctrl+C (⌘C on Mac) to copy it."

   The message stays for 6 seconds. Nothing claims success.
4. **Accessibility:** the code is always selectable (`select-text`), and the copy button becomes visible on keyboard focus, not only on hover.

There is no backend contract.

Tests: `src/components/chat/CodeBlock.test.tsx` (completion timing, denied permission, missing API, reset, selectability).
