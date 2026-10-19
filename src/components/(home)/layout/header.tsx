"use client";
import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { Github, Twitter, FileText } from "lucide-react";

export default function Header() {
  const router = useRouter();
  const { isAuthenticated, isClient } = useAuth();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-md">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <div
            className="flex items-center space-x-3 cursor-pointer"
            onClick={() => router.push("/")}
          >
            <Image
              src="/chenpilot.png"
              alt="ChenPilot Logo"
              width={32}
              height={32}
              className="rounded-full object-cover"
            />
            <span className="text-xl font-thin text-white tracking-wide">
              ChenPilot
            </span>
          </div>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center space-x-1"
          >
            {[
              { name: "Features", href: "#features" },
              { name: "Pricing", href: "#pricing" },
              { name: "About", href: "#about" },
            ].map((item) => (
              <a
                key={item.name}
                href={item.href}
                className="px-4 py-2 text-sm font-light text-white/60 hover:text-white transition-colors duration-300"
              >
                {item.name}
              </a>
            ))}
          </nav>

          <div className="flex items-center space-x-6">
            <div className="hidden lg:flex items-center space-x-4">
              {[
                { icon: Github, href: "#", label: "GitHub" },
                { icon: Twitter, href: "#", label: "Twitter" },
                { icon: FileText, href: "#", label: "Docs" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-white/40 hover:text-white transition-colors duration-300"
                >
                  <link.icon className="w-4 h-4" />
                </a>
              ))}
            </div>

            <Button
              onClick={() =>
                router.push(
                  isClient && isAuthenticated ? "/chat" : "/auth/login"
                )
              }
              className="px-6 py-2 text-sm font-light rounded-full bg-white text-black hover:bg-white/90 transition-all duration-300"
            >
              {isClient && isAuthenticated ? "Go to Chat" : "Get Started"}
            </Button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-white/10"></div>
    </header>
  );
}
