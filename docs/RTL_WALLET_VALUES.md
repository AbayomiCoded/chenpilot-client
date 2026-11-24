# Arabic (RTL) & Mixed-Direction Wallet Values (#293)

When the user selects Arabic (`ar`), `LanguageProvider` (`src/components/providers/LanguageProvider.tsx`) sets `dir="rtl"`, `lang="ar"`, `data-direction="rtl"`, and the `.rtl` class on `document.documentElement`, and exposes `{ language, direction, isRtl }` via `useLanguageDirection()`.

Because Stellar public keys, transaction hashes, token amounts, fees, ticker codes, and ledger numbers are inherently left-to-right (LTR), rendering them directly inside RTL prose causes the Unicode Bidirectional Algorithm to reorder punctuation (such as `...` in truncated addresses, `#` in ledger numbers, or `-` in negative amounts).

## Isolation Primitives

- **`<LtrText>` (`src/components/ui/LtrText.tsx`)**: Renders an HTML5 `<bdi dir="ltr" className="bidi-ltr-isolate">` element (`direction: ltr; unicode-bidi: isolate;` in `src/app/globals.css`). Use it for:
  - Stellar public keys and truncated addresses (`GABCD...WXYZ`)
  - Transaction hashes (full or truncated)
  - Token amounts and fees (`100.50 XLM`, `-25.00 USDC`, `0.00001 XLM`)
  - Ledger numbers (`#54321`) and asset ticker badges (`XLM`, `USDC`, `AQUA`)
- **`BIDI_LTR_INPUT_PROPS` (`src/components/ui/LtrText.tsx`)**: Spread `{...BIDI_LTR_INPUT_PROPS}` (`{ dir: 'ltr' }`) onto `<Input>` elements that accept addresses, hashes, or numeric amounts so cursor movement and pasted identifiers stay LTR in Arabic layouts.

## Logical Spacing & Directional Icons

- Prefer logical CSS/Tailwind properties (`start-*`, `end-*`, `ps-*`, `pe-*`, `ms-*`, `me-*`, `border-s`, `text-start`, `gap-*`) over physical `left-*`/`right-*`/`pl-*`/`ml-*`/`text-left` so Arabic layouts mirror naturally while isolated `<bdi dir="ltr">` values keep their semantic order.
- Mirror directional navigation icons (such as `ArrowLeft` and `ChevronRight`) with `rtl:rotate-180`.

## Audited Surfaces

| Surface | Files | RTL / BiDi Handling |
| --- | --- | --- |
| Document & Context | `src/components/providers/LanguageProvider.tsx`, `src/app/globals.css` | Sets `html[dir]`, `html[lang]`, `html[data-direction]`, `.rtl`, and `.bidi-ltr-isolate`; exposes `useLanguageDirection()`. |
| Send | `src/app/send/page.tsx`, `src/components/payment/ContactPicker.tsx` | Mirrors back/chevron icons (`rtl:rotate-180`), uses logical search padding (`start-3`, `ps-10`), isolates contact addresses and token badges in `<LtrText>`. |
| Contacts | `src/app/contacts/page.tsx` | Isolates contact addresses and `tokenType` in `<LtrText>`, applies `BIDI_LTR_INPUT_PROPS` to address inputs, uses logical search padding. |
| Transaction History | `src/app/transactions/page.tsx`, `src/components/dashboard/TransactionDetailsDrawer.tsx` | Isolates transaction hashes, `#ledger`, fees, operation amounts/assets, and `From`/`To`/`Counterparty` addresses in `<LtrText>`; uses logical drawer border (`border-s`) and spacing (`ms-2`). |
| Chat | `src/components/chat/CodeBlock.tsx`, `src/components/chat/AgentMessage.tsx` | Sets `dir="ltr"` + `bidi-ltr-isolate` on inline `<code>` and `dir="ltr" text-left` on `<pre>` code blocks; uses logical `text-start` and `pe-8` on agent messages. |

## Backend API Contract

No backend API contract changes are required. Directionality and bidirectional isolation are purely client-side presentation concerns; all addresses, hashes, and numeric strings continue to be transmitted in their canonical LTR format.

## Tests

See `src/components/providers/LanguageProvider.rtl.test.tsx` for Arabic RTL rendering tests covering `LanguageProvider`, Send/Contacts (`ContactPicker`), Transaction History (`TransactionDetailsDrawer`), and Chat (`CodeBlock` + mixed Arabic/LTR prose).
