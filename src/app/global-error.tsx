'use client';

import { useEffect } from 'react';
import { logger } from '@/utils/logger';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root layout error boundary (#147).
 * Replaces the entire document (including <html>/<body>) when the root layout
 * or a provider at that level throws.  Must include its own <html> and <body>
 * tags because Next.js removes the root layout when this file renders.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    logger.error('[GlobalErrorBoundary] Root layout error', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 font-sans">
        <div className="max-w-md w-full text-center space-y-6 px-4">
          <div className="space-y-2">
            <p className="text-5xl font-bold text-gray-200 dark:text-gray-700">500</p>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Application error
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              A critical error occurred. Reloading may resolve the issue.
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
          >
            Reload application
          </button>
        </div>
      </body>
    </html>
  );
}
