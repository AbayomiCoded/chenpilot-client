"use client";

import React, { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ReauthChallenge, ReauthPrompt } from "@/services/auth.service";

const ACTION_LABELS: Record<ReauthChallenge["action"], string> = {
  change_password: "change your password",
  delete_account: "delete your account",
  export_data: "export your data",
};

/**
 * Password prompt for server-requested re-authentication (#255).
 * `prompt` is passed to `withRecentAuth`; `close()` dismisses a pending prompt (e.g. after a timeout).
 */
export function useReauthPrompt() {
  const [challenge, setChallenge] = useState<ReauthChallenge | null>(null);
  const resolverRef = useRef<((password: string | null) => void) | null>(null);

  const settle = useCallback((password: string | null) => {
    resolverRef.current?.(password);
    resolverRef.current = null;
    setChallenge(null);
  }, []);

  const prompt: ReauthPrompt = useCallback((next) => {
    // A new prompt replaces any pending one, which is treated as cancelled
    resolverRef.current?.(null);
    setChallenge(next);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback(() => settle(null), [settle]);

  const dialog = (
    <ReauthDialog
      challenge={challenge}
      onSubmit={(password) => settle(password)}
      onCancel={() => settle(null)}
    />
  );

  return { prompt, close, dialog, isOpen: challenge !== null };
}

interface ReauthDialogProps {
  challenge: ReauthChallenge | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function ReauthDialog({ challenge, onSubmit, onCancel }: ReauthDialogProps) {
  const [password, setPassword] = useState("");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = password;
    // Never keep the password in component state after it is handed off
    setPassword("");
    if (value) onSubmit(value);
  };

  const cancel = () => {
    setPassword("");
    onCancel();
  };

  const minutes =
    challenge?.maxAgeSeconds !== undefined ? Math.max(1, Math.round(challenge.maxAgeSeconds / 60)) : null;

  return (
    <Modal isOpen={challenge !== null} onClose={cancel} title="Confirm it's you">
      {challenge && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-gray-300">
            To {ACTION_LABELS[challenge.action]}, enter your password
            {minutes ? ` (required when you haven't signed in within the last ${minutes} minutes)` : ""}.
          </p>
          <Input
            label="Password"
            type="password"
            name="password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={challenge.error}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={!password}>
              Confirm
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default ReauthDialog;
