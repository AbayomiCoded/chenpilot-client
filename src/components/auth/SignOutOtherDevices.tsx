"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/store";
import { clearAuth, fetchProfile } from "@/store/slices/authSlice";
import { authService } from "@/services/auth.service";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";

export default function SignOutOtherDevices() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmSignOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authService.signOutAllOtherDevices();
      setIsConfirming(false);
      toast.success("Other devices have been signed out. They will need to sign in again.");
      if (result.currentSessionRevoked) {
        authService.clearLocalSession();
        dispatch(clearAuth());
        router.replace("/auth/login");
      } else {
        await dispatch(fetchProfile()).unwrap();
      }
    } catch {
      // The revoke endpoint is isolated from the shared 401 interceptor, so a
      // request failure leaves both Redux and stored credentials untouched.
      setError("Could not sign out other devices. Your current session is still active. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-400">
        Sign out of every other device. Those devices will need to sign in again.
      </p>
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start"
        onClick={() => {
          setError(null);
          setIsConfirming(true);
        }}
      >
        Sign out of all other devices
      </Button>
      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          <p>{error}</p>
          <button type="button" className="mt-2 underline" onClick={confirmSignOut} disabled={isLoading}>Retry</button>
        </div>
      )}
      {isConfirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="sign-out-devices-title" className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-950 p-6 shadow-2xl">
            <h2 id="sign-out-devices-title" className="text-lg font-semibold text-white">Sign out of all other devices?</h2>
            <p className="mt-3 text-sm text-gray-300">Other devices will be signed out and will need to sign in again. If this action also ends your current session, you&apos;ll be sent to sign in.</p>
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setIsConfirming(false)} disabled={isLoading}>Cancel</Button>
              <Button type="button" variant="danger" onClick={confirmSignOut} loading={isLoading}>
                {isLoading ? "Signing out…" : "Sign out devices"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
