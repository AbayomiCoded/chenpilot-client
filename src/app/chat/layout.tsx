import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chat" };

export default function ChatRouteLayout({ children }: { children: React.ReactNode }) {
    return children;
}