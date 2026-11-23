"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resetPasswordSchema } from "@/utils/validation";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ResetPasswordFormData {
  password: string;
  confirmPassword: string;
}

interface ResetPasswordFormProps {
  token: string;
}

export default function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async ({ password }: ResetPasswordFormData) => {
    setRequestError(null);
    try {
      await authService.resetPassword(token, password);
      setIsComplete(true);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if ([400, 401, 404, 410, 422].includes(status ?? 0) || /expired|invalid.*token/.test(message)) {
        setRequestError("This reset link is invalid or has expired. Request a new one to continue.");
      } else {
        setRequestError("We couldn't reset your password right now. Please try again.");
      }
    }
  };

  if (!token) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950/80 p-8 text-white">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p role="alert" className="mt-4 text-sm text-red-300">This reset link is missing its token or has expired. Request a new link to continue.</p>
        <Link href="/auth/forgot-password" className="mt-6 inline-block text-sm text-blue-300">Request a new reset link</Link>
      </section>
    );
  }

  if (isComplete) {
    return (
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950/80 p-8 text-white">
        <h1 className="text-2xl font-semibold">Password updated</h1>
        <p role="status" className="mt-3 text-sm text-gray-300">Your password has been reset. Sign in with your new password.</p>
        <Button className="mt-6 w-full" onClick={() => router.push("/auth/login")}>Go to sign in</Button>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950/80 p-8 text-white shadow-2xl">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-gray-400">Use at least 8 characters, including uppercase, lowercase, and a number.</p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          {...register("password")}
          type="password"
          label="New password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.password)}
          error={errors.password?.message}
        />
        <Input
          {...register("confirmPassword")}
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.confirmPassword)}
          error={errors.confirmPassword?.message}
        />
        {requestError && <p role="alert" className="text-sm text-red-400">{requestError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">
          {isSubmitting ? "Updating…" : "Update password"}
        </Button>
      </form>
      <Link href="/auth/login" className="mt-6 inline-block text-sm text-blue-300 hover:text-blue-200">Back to sign in</Link>
    </section>
  );
}
