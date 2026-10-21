"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { SignInActivityEvent, SignInActivityPage } from "@/types";
import {
  describeDevice,
  describeLocation,
  loadSignInActivity,
  maskIpAddress,
  reportSignInEvent,
  revokeSession,
} from "@/services/sessionService";

const EVENT_LABELS: Record<SignInActivityEvent["type"], string> = {
  sign_in: "Sign-in",
  sign_out: "Sign-out",
  password_change: "Password changed",
  reauthentication: "Identity confirmed",
  token_refresh: "Session refreshed",
};

type ViewState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string }
  | { kind: "ready"; page: SignInActivityPage };

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/**
 * Recent sign-in activity (#257): date, approximate device/browser and outcome. IP-level
 * detail is hidden by default and, when shown, coarsened. Revoke/report appear only when
 * the backend advertises support.
 */
export function SignInActivity() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [showDetails, setShowDetails] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const [reported, setReported] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await loadSignInActivity();
    if (result.status === "ok") setState({ kind: "ready", page: result.page });
    else if (result.status === "unsupported") setState({ kind: "unsupported" });
    else setState({ kind: "error", message: result.message });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, run: () => Promise<void>, done: () => void, success: string) => {
    setPending(key);
    setNotice(null);
    try {
      await run();
      done();
      setNotice(success);
    } catch {
      setNotice("That didn't work. Please try again.");
    } finally {
      setPending(null);
    }
  };

  if (state.kind === "loading") {
    return <p role="status" className="text-sm text-gray-400">Loading recent activity…</p>;
  }
  if (state.kind === "unsupported") {
    return <p className="text-sm text-gray-400">Sign-in activity isn&apos;t available for your account yet.</p>;
  }
  if (state.kind === "error") {
    return (
      <div role="alert" className="flex items-center gap-3 text-sm text-red-400">
        <span>{state.message}</span>
        <Button variant="ghost" size="sm" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  const { events, capabilities } = state.page;
  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No recent sign-in activity.</p>;
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input type="checkbox" checked={showDetails} onChange={(e) => setShowDetails(e.target.checked)} />
        Show network details
      </label>
      <ul className="divide-y divide-gray-800" aria-label="Recent sign-in activity">
        {events.map((event) => {
          const location = describeLocation(event);
          const network = showDetails ? maskIpAddress(event.ipAddress) : null;
          const sessionRevoked = event.sessionId ? revoked.has(event.sessionId) : false;
          return (
            <li key={event.id} className="flex flex-wrap items-start justify-between gap-2 py-3" data-testid="activity-event">
              <div className="min-w-0">
                <p className="text-sm text-white">
                  {EVENT_LABELS[event.type]}{" "}
                  <span className={event.outcome === "success" ? "text-green-400" : "text-red-400"}>
                    {event.outcome === "success" ? "succeeded" : "failed"}
                  </span>
                  {event.current && (
                    <span className="ml-2 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300">This device</span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time> · {describeDevice(event)}
                  {location ? ` · ${location}` : ""}
                  {network ? ` · ${network}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {capabilities.revokeSession && event.sessionId && !event.current && event.outcome === "success" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null || sessionRevoked}
                    onClick={() =>
                      act(
                        `revoke:${event.id}`,
                        () => revokeSession(event.sessionId!),
                        () => setRevoked((prev) => new Set(prev).add(event.sessionId!)),
                        "That session was signed out.",
                      )
                    }
                  >
                    {sessionRevoked ? "Signed out" : "Sign out session"}
                  </Button>
                )}
                {capabilities.reportEvent && !event.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending !== null || reported.has(event.id)}
                    onClick={() =>
                      act(
                        `report:${event.id}`,
                        () => reportSignInEvent(event.id),
                        () => setReported((prev) => new Set(prev).add(event.id)),
                        "Thanks. We'll review this activity. Consider changing your password.",
                      )
                    }
                  >
                    {reported.has(event.id) ? "Reported" : "This wasn't me"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {notice && (
        <p role="status" className="text-sm text-gray-300">
          {notice}
        </p>
      )}
    </div>
  );
}

export default SignInActivity;
