import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ACCOUNT_EXISTENCE_PATTERNS, isNormalizedAuthError, normalizeAuthError } from '@/services/auth.service';

/**
 * Attach a failed auth request's field errors to react-hook-form inputs (#258).
 * Returns the general message to show at form level. Messages never contain `secrets`.
 *
 * With `hideAccountExistence`, errors that could reveal whether an account exists are dropped
 * (account-enumeration resistance): every server error on `email`, and any message matching
 * `ACCOUNT_EXISTENCE_PATTERNS`. Callers then show the generic auth message instead.
 */
export function applyAuthErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly string[],
  setError: UseFormSetError<T>,
  secrets: Array<string | undefined> = [],
  options: { hideAccountExistence?: boolean } = {}
): { message: string; hasFieldErrors: boolean } {
  const normalized = isNormalizedAuthError(error) ? error : normalizeAuthError(error, fields, secrets);
  const entries = Object.entries(normalized.fieldErrors).filter(([field, message]) => {
    if (!fields.includes(field)) return false;
    if (!options.hideAccountExistence) return true;
    return field !== 'email' && !ACCOUNT_EXISTENCE_PATTERNS.some((pattern) => pattern.test(message));
  });

  entries.forEach(([field, message], index) => {
    setError(field as Path<T>, { type: 'server', message }, { shouldFocus: index === 0 });
  });

  return { message: normalized.message, hasFieldErrors: entries.length > 0 };
}
