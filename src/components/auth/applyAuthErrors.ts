import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { isNormalizedAuthError, normalizeAuthError } from '@/services/auth.service';

/**
 * Attach a failed auth request's field errors to react-hook-form inputs (#258).
 * Returns the general message to show at form level. Messages never contain `secrets`.
 */
export function applyAuthErrors<T extends FieldValues>(
  error: unknown,
  fields: readonly string[],
  setError: UseFormSetError<T>,
  secrets: Array<string | undefined> = []
): { message: string; hasFieldErrors: boolean } {
  const normalized = isNormalizedAuthError(error) ? error : normalizeAuthError(error, fields, secrets);
  const entries = Object.entries(normalized.fieldErrors).filter(([field]) => fields.includes(field));

  entries.forEach(([field, message], index) => {
    setError(field as Path<T>, { type: 'server', message }, { shouldFocus: index === 0 });
  });

  return { message: normalized.message, hasFieldErrors: entries.length > 0 };
}
