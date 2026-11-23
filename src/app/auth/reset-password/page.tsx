import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Choose a New Password" };

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black px-4 py-12 text-white">
      <Link href="/" className="mb-8 text-sm text-gray-400 hover:text-white">ChenPilot</Link>
      <ResetPasswordForm token={token ?? ""} />
    </main>
  );
}
