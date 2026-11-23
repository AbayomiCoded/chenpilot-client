import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers/Providers";
import { OfflineServiceWorker } from "@/components/providers/OfflineServiceWorker";
import { SkipLink } from "@/components/layout/SkipLink";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "ChenPilot - AI Co-Pilot for Cross-Chain DeFi",
    template: "%s | ChenPilot",
  },
  description:
    "AI-powered multi-agent system that simplifies how users interact with Bitcoin and Starknet",
  keywords: ["DeFi", "Starknet", "Bitcoin", "AI", "Cross-chain", "Crypto"],
  authors: [{ name: "ChenPilot Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: THEME_INIT_SCRIPT sets the theme class before React hydrates (#296)
    <html lang="en" dir="ltr" className={`${manrope.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Apply the saved/system theme before the first paint, avoiding a flash (#296) */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased bg-white dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300 h-full">
        <SkipLink />
        <Providers>{children}</Providers>
        <OfflineServiceWorker />
      </body>
    </html>
  );
}
