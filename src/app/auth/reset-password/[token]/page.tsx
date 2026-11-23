import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a New Password" };

interface TokenResetPasswordPageProps {
  params: Promise<{ token: string }>;
}

export default async function TokenResetPasswordPage({ params }: TokenResetPasswordPageProps) {
  const { token } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-12 text-white">
      <Link href="/" className="mb-8 text-sm text-gray-400 hover:text-white">ChenPilot</Link>
      <ResetPasswordForm token={token} />
    </main>
  );
}