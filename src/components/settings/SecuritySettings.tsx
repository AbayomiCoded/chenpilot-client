"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useReauthPrompt } from "@/components/auth/ReauthDialog";
import {
  ReauthCancelledError,
  ReauthFailedError,
  ReauthTimeoutError,
  SensitiveAction,
  withRecentAuth,
} from "@/services/auth.service";
import apiService from "@/services/api";

interface SecuritySettingsProps {
  title: string;
  /** Called after the account is deleted (e.g. log out and redirect). */
  onAccountDeleted: () => void;
}

type Status = { tone: "success" | "error" | "info"; text: string } | null;

/** Message for a sensitive action that did not complete (#255). */
export function describeSensitiveActionError(error: unknown): string {
  if (error instanceof ReauthCancelledError) return "Cancelled. Nothing was changed.";
  if (error instanceof ReauthTimeoutError) return "Confirmation timed out. Nothing was changed.";
  if (error instanceof ReauthFailedError) return error.message;
  const message = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message;
  return message || "Something went wrong. Please try again.";
}

/**
 * Settings → Security (#255). Change password and delete account are sensitive actions: the
 * server may answer `REAUTH_REQUIRED`, in which case the user confirms their password first.
 */
export function SecuritySettings({ title, onAccountDeleted }: SecuritySettingsProps) {
  const reauth = useReauthPrompt();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState<SensitiveAction | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const runSensitive = async (action: SensitiveAction, run: () => Promise<unknown>) => {
    setBusy(action);
    setStatus(null);
    try {
      await withRecentAuth(action, run, reauth.prompt);
      return true;
    } catch (error) {
      setStatus({ tone: error instanceof ReauthCancelledError ? "info" : "error", text: describeSensitiveActionError(error) });
      return false;
    } finally {
      // Dismiss a prompt left open by a timeout
      reauth.close();
      setBusy(null);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await runSensitive("change_password", () => apiService.changePassword(currentPassword, newPassword));
    // Never keep passwords around after the request settles
    setCurrentPassword("");
    setNewPassword("");
    if (ok) {
      setShowPasswordForm(false);
      setStatus({ tone: "success", text: "Your password was changed." });
    }
  };

  const deleteAccount = async () => {
    const ok = await runSensitive("delete_account", () => apiService.deleteAccount());
    setConfirmDelete(false);
    if (ok) onAccountDeleted();
  };

  return (
    <div className="p-6">
      <h3 className="text-lg font-medium text-white mb-4">{title}</h3>
      <div className="space-y-4">
        {showPasswordForm ? (
          <form onSubmit={changePassword} className="space-y-3" aria-label="Change password">
            <Input
              label="Current password"
              aria-label="Current password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              label="New password"
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!currentPassword || !newPassword || busy !== null}>
                {busy === "change_password" ? "Saving…" : "Update password"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowPasswordForm(false);
                  setCurrentPassword("");
                  setNewPassword("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" className="w-full justify-start" onClick={() => setShowPasswordForm(true)}>
            Change Password
          </Button>
        )}

        {confirmDelete ? (
          <div className="space-y-2 rounded-md border border-red-800 p-3">
            <p className="text-sm text-red-300">This permanently deletes your account. This can&apos;t be undone.</p>
            <div className="flex gap-2">
              <Button
                type="button"
                className="bg-red-600 hover:bg-red-700"
                disabled={busy !== null}
                onClick={deleteAccount}
              >
                {busy === "delete_account" ? "Deleting…" : "Yes, delete my account"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep account
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600 hover:text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            Delete Account
          </Button>
        )}

        {status && (
          <p
            role={status.tone === "error" ? "alert" : "status"}
            className={`text-sm ${status.tone === "error" ? "text-red-400" : status.tone === "success" ? "text-green-400" : "text-gray-400"}`}
          >
            {status.text}
          </p>
        )}
      </div>
      {reauth.dialog}
    </div>
  );
}

export default SecuritySettings;
