import { ReauthCancelledError, ReauthFailedError, ReauthTimeoutError } from '@/services/auth.service';

/** Message for a sensitive action that did not complete after a step-up prompt (#255). */
export function describeSensitiveActionError(error: unknown): string {
  if (error instanceof ReauthCancelledError) return 'Cancelled. Nothing was changed.';
  if (error instanceof ReauthTimeoutError) return 'Confirmation timed out. Nothing was changed.';
  if (error instanceof ReauthFailedError) return error.message;
  const message = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message;
  return message || (error instanceof Error ? error.message : '') || 'Something went wrong. Please try again.';
}
