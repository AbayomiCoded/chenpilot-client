"use client";
import React from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export default function FloatingElements() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className={`absolute top-20 left-20 ${prefersReducedMotion ? "" : "animate-float"}`}></div>
      <div className={`absolute top-32 right-32 ${prefersReducedMotion ? "" : "animate-float-delayed"}`}></div>
      <div className={`absolute bottom-20 left-1/3 ${prefersReducedMotion ? "" : "animate-float-slow"}`}></div>

      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes float-delayed {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-15px);
          }
        }
        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-float-delayed {
          animation: float-delayed 8s ease-in-out infinite;
        }
        .animate-float-slow {
          animation: float-slow 10s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
