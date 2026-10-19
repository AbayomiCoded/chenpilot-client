'use client';

import React, { useState, useEffect } from 'react';
import { ChatLayout } from './ChatLayout';

interface ClientOnlyChatLayoutProps {
  children: React.ReactNode;
}

export function ClientOnlyChatLayout({ children }: ClientOnlyChatLayoutProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return (
      <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="h-full flex flex-col items-center justify-center p-8">
                <main
                  id="main-content"
                  tabIndex={-1}
                  aria-label="Main content"
                  className="text-center"
                >
                  <p className="text-gray-300">Loading...</p>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <ChatLayout>{children}</ChatLayout>;
}
