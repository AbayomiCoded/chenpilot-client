# Agent Markdown Safety Policy (#263)

Agent responses are untrusted input: they can echo user text, on-chain data, or third-party content. `AgentMessage` renders them through `AgentMarkdown` (`src/components/chat/AgentMarkdown.tsx`), following the rules in `src/utils/markdownPolicy.ts`.

## HTML

- Raw HTML in Markdown is **not rendered**. `react-markdown` runs with `skipHtml`, and there is no `rehype-raw`. Tags such as `<script>`, `<img onerror>`, `<iframe>` and `<b>` are dropped.
- HTML may only be turned on together with a sanitizer (e.g. `rehype-sanitize` with an explicit allowlist), plus tests covering the payloads in `AgentMarkdown.test.tsx`.
- HTML inside inline or fenced code renders as text.

## Links

| URL | Result |
|-----|--------|
| `https:`, `http:` | Link; opens in a new tab with `target="_blank"` and `rel="noopener noreferrer nofollow ugc"` |
| `mailto:` | Link in the same tab, no `target` |
| `#fragment` | In-page link, same tab |
| `javascript:`, `vbscript:`, `data:`, `file:`, `blob:`, any other scheme | Link dropped; the text renders as plain text |
| Protocol-relative (`//host`) or app-relative (`/path`, `path`) | Link dropped. Agent output must not navigate inside the app (e.g. to `/settings/...`) |

Before the scheme is checked, the URL is trimmed and control characters and whitespace are removed, so `java\tscript:` and `\u0000javascript:` are rejected. Autolinked bare URLs get the same treatment.

## Images

Images are **never loaded**. Remote images can be tracking pixels and reveal the viewer's IP. `![alt](https://...)` renders as a `[alt]` link with the external-link attributes; an image with an unsafe URL renders as plain `[alt]` text.

## Code

`CodeBlock` highlights with highlight.js and inserts the result with `dangerouslySetInnerHTML`. highlight.js escapes its input. If highlighting throws, the fallback is escaped with `escapeHtml`. The language tag from the fence is limited to `[a-z0-9+#_-]{1,32}` before it is used in class names.

## Backend Contract

There is no new API. Agents should send links as Markdown with absolute `https:` URLs. Anything else is rendered as text.

## Tests

- `src/utils/markdownPolicy.test.ts`: URL allow/deny list, escaping, language tags
- `src/components/chat/AgentMarkdown.test.tsx`: script/HTML payloads, unsafe link schemes, external-link attributes, images, HTML in code
- `src/components/chat/CodeBlock.test.tsx`: escaped fallback when highlighting fails, unsafe language tags
