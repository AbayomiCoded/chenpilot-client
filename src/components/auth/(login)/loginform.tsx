"use client";
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/utils/validation";
import { useAppDispatch, useAppSelector } from "@/store";
import { login } from "@/store/slices/authSlice";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GoogleSignInButton } from "@/components/auth/GoogleSignIn";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";

interface LoginFormData {
  email: string;
  password: string;
}

export default function LoginForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { isLoading } = useAppSelector((state) => state.auth);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      await dispatch(login(data)).unwrap();
      toast.success("Successfully logged in!");
      router.push("/chat");
    } catch (error: any) {
      toast.error(error?.message || "Login failed");
    }
  };

  const onInvalid = () => {
    toast.error("Please fix the errors in the form");
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-12">
        <span className="text-xs text-white/40 font-light tracking-[0.3em] uppercase block mb-6">
          Welcome Back
        </span>

      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} noValidate className="space-y-6">
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
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-required="true"
              aria-invalid={errors.password ? "true" : "false"}
              aria-describedby={errors.password ? "password-error" : undefined}
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
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-white/40 font-light cursor-pointer">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              className="w-4 h-4 border border-white/10 bg-transparent"
              aria-describedby="remember-me-desc"
            />
            <span id="remember-me-desc">Remember me</span>
          </label>
          <Link
            href="/auth/forgot-password"
            className="text-white/40 hover:text-white font-light transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="group w-full px-10 py-4 text-base font-light rounded-full bg-white text-black hover:bg-white/90 transition-all duration-500 flex items-center justify-center gap-3"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              Signing in...
            </>
          ) : (
            <>
              Sign In
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
            onError={(error) => console.error(error)}
            className="w-full px-10 py-4 text-base font-light rounded-full border border-white/10 text-black hover:text-white hover:border-white/20 transition-all duration-500"
          />
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-white/40 font-light">
          Don't have an account?{" "}
          <Link
            href="/auth/register"
            className="text-white hover:text-white/80 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
