"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema } from "@/utils/validation";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface ForgotPasswordFormData {
  email: string;
}

export default function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async ({ email }: ForgotPasswordFormData) => {
    try {
      await authService.requestPasswordReset(email);
    } catch {
      // Keep all backend outcomes indistinguishable to prevent account enumeration.
    } finally {
      setSubmitted(true);
    }
  };

  return (
    <section className="w-full max-w-md rounded-2xl border border-white/10 bg-gray-950/80 p-8 text-white shadow-2xl">
      <h1 className="text-2xl font-semibold">Forgot password?</h1>
      <p className="mt-2 text-sm text-gray-400">Enter the email address associated with your account.</p>
      {submitted ? (
        <p role="status" className="mt-6 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
          If an account exists for that email, you&apos;ll receive a password reset link shortly.
        </p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Input
            {...register("email")}
            id="forgot-password-email"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            error={errors.email?.message}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/auth/login" className="mt-6 inline-block text-sm text-blue-300 hover:text-blue-200">
        Back to sign in
      </Link>
    </section>
  );
}
