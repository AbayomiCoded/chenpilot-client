"use client";
import React from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { motion } from "framer-motion";

export default function Hero() {
  const router = useRouter();
  const { isAuthenticated, isClient } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-black overflow-hidden mt-30 px-6">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      {/* Animated background circle */}
      <motion.div
        className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full"
        animate={prefersReducedMotion ? undefined : {
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={prefersReducedMotion ? undefined : {
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="relative z-10 max-w-6xl w-full text-center">
        {/* Headline left-aligned */}
        <motion.h1
          className="text-7xl md:text-8xl lg:text-9xl font-thin tracking-tight mb-8 text-left mx-auto"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 1, ease: "easeOut", delay: 0.2 }}
        >
          <span className="block text-white/90">Your Crypto</span>
          <span className="block text-purple-500">Agent</span>
        </motion.h1>

        {/* Description - centered */}
        <motion.p
          className="text-lg md:text-xl text-white/40 max-w-xl mx-auto mb-6 font-thin leading-relaxed"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 0.4 }}
        >
          Trade, swap, and manage your portfolio across multiple chains through
          natural conversation.
        </motion.p>

        <motion.p
          className="text-base text-white/30 max-w-lg mx-auto mb-16 font-thin"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 0.5 }}
        >
          No dashboards. No complexity. Just you and your AI agent working
          together.
        </motion.p>

        {/* Get Started button */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 0.6 }}
          className="flex justify-center"
        >
          <Button
            onClick={() =>
              router.push(isClient && isAuthenticated ? "/chat" : "/auth/login")
            }
            className="group px-10 py-4 text-base font-thin rounded-full bg-white text-black hover:bg-white/90 transition-all duration-500"
          >
            <span className="flex items-center gap-3">
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-500" />
            </span>
          </Button>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="flex items-center justify-center gap-8 mt-20"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 0.8 }}
        >
          <div className="text-center">
            <div className="text-2xl font-thin text-white/80 mb-1">$300</div>
            <div className="text-xs text-white/30 font-thin tracking-wider">
              VOLUME
            </div>
          </div>
          <span className="w-px h-12 bg-white/10"></span>
          <div className="text-center">
            <div className="text-2xl font-thin text-white/80 mb-1">3</div>
            <div className="text-xs text-white/30 font-thin tracking-wider">
              CHAINS
            </div>
          </div>
          <span className="w-px h-12 bg-white/10"></span>
          <div className="text-center">
            <div className="text-2xl font-thin text-white/80 mb-1">10+</div>
            <div className="text-xs text-white/30 font-thin tracking-wider">
              USERS
            </div>
          </div>
        </motion.div>

        {/* Supported chains */}
        <motion.div
          className="flex items-center justify-center gap-6 mt-12"
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 1 }}
        >
          <span className="text-xs text-white/30 font-thin tracking-wider">
            BITCOIN
          </span>
          <span className="w-px h-3 bg-white/20"></span>
          <span className="text-xs text-white/30 font-thin tracking-wider">
            STARKNET
          </span>
          <span className="w-px h-3 bg-white/20"></span>
          <span className="text-xs text-white/30 font-thin tracking-wider">
            ETHEREUM
          </span>
          <span className="w-px h-3 bg-white/20"></span>
          <span className="text-xs text-white/30 font-thin tracking-wider">
            DEFI
          </span>
        </motion.div>
      </div>

      {/* Bottom line */}
      <motion.div
        className="absolute bottom-0 left-0 right-0"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 1, delay: 1 }}
      >
        <div className="h-px bg-white/10 w-full"></div>
      </motion.div>
    </section>
  );
}
