import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Conversation not found – ChenPilot',
};

/**
 * Chat-segment 404 page (#148).
 * Rendered when a deep-linked conversation ID does not match any known
 * conversation (e.g. /chat/[conversationId] calls `notFound()`).
 */
export default function ChatNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F0F23] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-6xl font-bold text-gray-700">404</p>
          <h1 className="text-2xl font-semibold text-white">
            Conversation not found
          </h1>
          <p className="text-gray-400">
            This conversation doesn&apos;t exist or may have been deleted.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/chat">
            <Button variant="primary">Start a new chat</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
