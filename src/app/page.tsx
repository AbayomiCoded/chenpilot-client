"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/(home)/layout/header";

// Dynamically import sections to reduce initial bundle size
const Hero = dynamic(() => import("@/components/(home)/sections/hero"), {
  loading: () => <div className="h-screen flex items-center justify-center">Loading...</div>,
});
const Features = dynamic(() => import("@/components/(home)/sections/features"), {
  loading: () => <div className="h-96 flex items-center justify-center">Loading...</div>,
});
const Logos = dynamic(() => import("@/components/(home)/sections/logos"), {
  loading: () => <div className="h-64 flex items-center justify-center">Loading...</div>,
});
const Capabilities = dynamic(() => import("@/components/(home)/sections/capabilities"), {
  loading: () => <div className="h-96 flex items-center justify-center">Loading...</div>,
});
const CTA = dynamic(() => import("@/components/(home)/sections/CTA"), {
  loading: () => <div className="h-96 flex items-center justify-center">Loading...</div>,
});
const Footer = dynamic(() => import("@/components/(home)/layout/footer"), {
  loading: () => <div className="h-64 flex items-center justify-center">Loading...</div>,
});

export default function Home() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) =>
      setMousePosition({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
      </div>

      <Header />
      <main id="main-content" tabIndex={-1} aria-label="Main content" className="relative z-10">
        <Hero />
        <Features />
        <Logos />
        <Capabilities />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
