# Status Announcements (#307)

Async status is announced through `LiveAnnouncer` (`src/components/ui/LiveAnnouncer.tsx`), a visually hidden live region.

| Flow | Pending (polite) | Success (polite) | Error (assertive, `role="alert"`) |
| --- | --- | --- | --- |
| Send payment | "Sending payment…" | "Payment sent." | "Payment failed: <reason>" / "Payment not sent: <reason>" |
| Sign in | "Signing in…" | "Signed in." | The generic privacy-safe login error |
| Register | "Creating account…" | "Account created." | The generic privacy-safe registration error |
| Retry banner | "Retrying <request>, attempt N of M" | — | — |

**No duplicate announcements:**
- Screen readers announce a live region only when its text changes, so re-renders don't repeat a status.
- react-hot-toast makes every toast a polite live region. The toasts for flows that `LiveAnnouncer` already covers pass `SILENT_TOAST` (`aria-live="off"`), so each outcome is spoken once.
- `RetryStatusBanner` announces only the attempt message. Its visible countdown, which updates every 250ms, is `aria-hidden` and outside the live region.

Field validation errors keep their existing `role="alert"`.
