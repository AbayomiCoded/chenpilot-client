"use client";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch } from "@/store";
import { register as registerUser, REGISTER_FIELDS } from "@/store/slices/authSlice";
import { applyAuthErrors } from "@/components/auth/applyAuthErrors";
import { registerSchema } from "@/utils/validation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GoogleSignInButton } from "@/components/auth/GoogleSignIn";
import { PasswordStrengthMeter } from "@/components/auth/(register)/passwordStrengthMeter";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { isTerminalAuthError, useClearPasswordOnLeave } from "@/components/auth/passwordHygiene";
import { authService, toAuthPayload } from "@/services/auth.service";

interface RegisterFormData {
  email: string;
  password: string;
  name?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  // Never leave a submitted password behind after leaving the page or a bfcache restore (#253)
  useClearPasswordOnLeave(() => setValue("password", ""));

  const passwordValue = watch("password") ?? "";

  const onSubmit = async (data: RegisterFormData) => {
    try {
      // Same email normalization as login; the password is sent exactly as typed (#259)
      const cleanData = toAuthPayload({
        email: String(data.email),
        password: String(data.password),
        name: data.name ? String(data.name) : undefined,
      });
      await dispatch(registerUser(cleanData)).unwrap();
      toast.success("Account created successfully! Welcome to ChenPilot!");
      router.push("/chat");
    } catch (error: unknown) {
      // Privacy-safe: the toast is always the generic message. Server field errors are attached
      // to inputs only when they can't reveal whether an account exists (e.g. password rules) (#258).
      // Name and email are kept; terminal failures clear and refocus the password, transient ones
      // keep it for an easy resubmit (#253).
      toast.error(authService.normalizeRegisterError(error));
      applyAuthErrors(error, REGISTER_FIELDS, setError, [data.password], { hideAccountExistence: true });
      if (isTerminalAuthError(error)) {
        setValue("password", "");
        setFocus("password");
      }
    }
  };

  const onInvalid = () => {
    toast.error("Please fix the errors in the form");
  };

  return (
    <div className="w-full max-w-md mt-20">
      <div className="mb-12">
        <span className="text-xs text-white/40 font-light tracking-[0.3em] uppercase block mb-6">
          Get Started
        </span>

        <p className="text-base text-white/40 font-light leading-relaxed">
          Join thousands trading smarter with AI-powered assistance
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6">
        <div>
          <label
            htmlFor="name"
            className="block text-xs text-white/60 font-light tracking-wider uppercase mb-3"
          >
            Full Name
          </label>
          <Input
            {...register("name")}
            type="text"
            id="name"
            name="name"
            autoComplete="name"
            placeholder="John Doe"
            aria-invalid={errors.name ? "true" : "false"}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="w-full bg-transparent border border-white/10 text-white placeholder-white/30 px-4 py-3 font-light focus:border-white/30 focus:outline-none transition-colors duration-300"
          />
          {errors.name && (
            <p id="name-error" className="mt-2 text-xs text-red-400 font-light" role="alert">
              {errors.name.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-xs text-white/60 font-light tracking-wider uppercase mb-3"
          >
            Email Address
          </label>
          <Input
            {...register("email")}
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            placeholder="your@email.com"
            aria-required="true"
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="w-full bg-transparent border border-white/10 text-white placeholder-white/30 px-4 py-3 font-light focus:border-white/30 focus:outline-none transition-colors duration-300"
          />
          {errors.email && (
            <p id="email-error" className="mt-2 text-xs text-red-400 font-light" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs text-white/60 font-light tracking-wider uppercase mb-3"
          >
            Password
          </label>
          <div className="relative">
            <Input
              {...register("password")}
              type={showPassword ? "text" : "password"}
              id="password"
              name="password"
              autoComplete="new-password"
              placeholder="Create a strong password"
              aria-required="true"
              aria-invalid={errors.password ? "true" : "false"}
              aria-describedby={errors.password ? "password-error" : "password-hint"}
              className="w-full bg-transparent border border-white/10 text-white placeholder-white/30 px-4 py-3 pr-12 font-light focus:border-white/30 focus:outline-none transition-colors duration-300"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-4 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4 text-white/40 hover:text-white/60 transition-colors" />
              ) : (
                <Eye className="h-4 w-4 text-white/40 hover:text-white/60 transition-colors" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-2 text-xs text-red-400 font-light" role="alert">
              {errors.password.message}
            </p>
          )}

          <PasswordStrengthMeter password={passwordValue} />
        </div>

        <div className="flex items-start gap-2 text-sm pt-2">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            required
            aria-required="true"
            aria-describedby="terms-desc"
            className="w-4 h-4 mt-0.5 border border-white/10 bg-transparent"
          />
          <label htmlFor="terms" id="terms-desc" className="text-white/40 font-light">
            I agree to the{" "}
            <a
              href="#"
              className="text-white hover:text-white/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="#"
              className="text-white hover:text-white/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </label>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="group w-full px-10 py-4 text-base font-light rounded-full bg-white text-black hover:bg-white/90 transition-all duration-500 flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Creating account...
            </>
          ) : (
            <>
              Create Account
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-500" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-4 bg-black text-white/40 font-light tracking-wider uppercase">
              Or continue with
            </span>
          </div>
        </div>

        <div className="mt-6">
          <GoogleSignInButton
            onSuccess={() => router.push("/chat")}
            onError={(error) => console.error("Google Sign-in error:", error)}
            className="w-full px-10 py-4 text-black text-base font-light rounded-full border border-white/10 hover:text-white hover:border-white/20 transition-all duration-500"
          />
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-white/40 font-light">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="text-white hover:text-white/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
