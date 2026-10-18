import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Page not found – ChenPilot',
};

/**
 * App-level 404 page (#148).
 * Rendered by Next.js when no matching route is found anywhere under src/app.
 * Runs as a server component so it is statically renderable.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900 px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-6xl font-bold text-gray-200 dark:text-gray-700">404</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Page not found
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard">
            <Button variant="primary">Go to dashboard</Button>
          </Link>
          <Link href="/chat">
            <Button variant="secondary">Open chat</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
