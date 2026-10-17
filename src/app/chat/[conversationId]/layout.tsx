import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conversation" };

export default function ConversationLayout({ children }: { children: React.ReactNode }) {
    return children;
}