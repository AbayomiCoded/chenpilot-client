import type { Metadata } from "next";
import Link from "next/link";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset Password" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-12 text-white">
      <Link href="/" className="mb-8 text-sm text-gray-400 hover:text-white">ChenPilot</Link>
      <ForgotPasswordForm />
    </main>
  );
}
