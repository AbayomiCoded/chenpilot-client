# Chenpilot Client Architecture

Welcome to the architectural documentation for **Chenpilot Client (`gear5labs/chenpilot-client`)**. This guide outlines the application's route tree, Redux state management, Axios networking layer, Socket.io real-time lifecycle, and a feature-placement decision guide.

---

## 1. Route Tree & Layout Chrome (`src/app`)

Chenpilot Client utilizes the Next.js App Router (`src/app/`) for file-system routing and layout encapsulation.

```text
src/app/
├── layout.tsx             # Root layout (Metadata, Viewport, Providers, PWA Service Worker)
├── page.tsx               # Landing / Entry redirect
├── globals.css            # Tailwind base, safe-area utilities, mobile scroll locks
├── auth/                  # Authentication routes (Login, Register, SSO Callback)
└── dashboard/             # Core authenticated workspace routes
    ├── layout.tsx         # Shared ChatLayout (Sidebar drawer, safe-area header, mobile responsiveness)
    ├── page.tsx           # Dashboard home / analytics overview
    └── chat/              # Real-time chat & collaboration interface