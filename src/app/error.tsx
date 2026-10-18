'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/Button';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route-level error boundary (#147).
 * Rendered by Next.js whenever a server or client component in this segment
 * throws during render or data-fetching.  `reset()` re-renders the segment
 * tree without a full navigation; the home link is the fallback for
 * unrecoverable errors.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const router = useRouter();

  useEffect(() => {
    logger.error('[ErrorBoundary] Route segment error', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-5xl font-bold text-gray-200 dark:text-gray-700">500</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Something went wrong
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            An unexpected error occurred. You can try again or return to the dashboard.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 dark:text-gray-600 font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
          <Button variant="secondary" onClick={() => router.push('/dashboard')}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
