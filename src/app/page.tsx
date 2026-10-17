"use client";
import React, { useEffect, useState } from "react";
import Footer from "@/components/(home)/layout/footer";
import CTA from "@/components/(home)/sections/CTA";
import Capabilities from "@/components/(home)/sections/capabilities";
import Logos from "@/components/(home)/sections/logos";
import Features from "@/components/(home)/sections/features";
import Hero from "@/components/(home)/sections/hero";
import Header from "@/components/(home)/layout/header";

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
