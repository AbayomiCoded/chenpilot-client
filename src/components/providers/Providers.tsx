"use client";

import React, { useEffect } from "react";
import { Provider } from "react-redux";
import toast, { Toaster } from "react-hot-toast";
import { store } from "@/store";
import { initializeAuth } from "@/store/slices/authSlice";
import { initializeUI } from "@/store/slices/uiSlice";
import { ThemeProvider } from "./ThemeProvider";
import { LanguageProvider } from "./LanguageProvider";
import apiService from "@/services/api";
import { SocketProvider } from "./SocketProvider";
import apiService from "@/services/api";
import { CHAT_MESSAGE_EVENT } from "@/hooks/useChatResync";
import { TransactionToastListener } from "@/components/TransactionToastListener";
import { ToastOverflowManager } from "@/components/providers/ToastOverflowManager";

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    apiService.loadTokenFromStorage();
    // Initialize authentication state from localStorage
    store.dispatch(initializeAuth());
    // Initialize UI state (theme, language, etc.)
    store.dispatch(initializeUI());

    // Sync auth state across browser tabs
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token' || e.key === 'user_data') {
        // Re-initialize auth state when it changes in another tab
        store.dispatch(initializeAuth());
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <Provider store={store}>
      <ThemeProvider>
        <LanguageProvider>
          <SessionManagementProvider>
            <PresenceProvider>
              <SocketProvider
                configKey="default"
                config={{
                  url:
                    process.env.NEXT_PUBLIC_SOCKET_URL ||
                    "http://localhost:3001",
                  options: {
                    transports: ["websocket", "polling"],
                    autoConnect: true,
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionAttempts: 5,
                    timeout: 20000,
                  },
                  // Catch up on chat events missed while disconnected (#277)
                  resync: {
                    events: [CHAT_MESSAGE_EVENT],
                    fetchMissed: (cursor) => apiService.getMissedChatEvents(cursor),
                  },
                }}
                autoConnect={true}
              >
                {children}
                <SessionExpirationWarning />
                <TransactionToastListener />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    style: {
                      background: "#363636",
                      color: "#fff",
                    },
                    success: {
                      duration: 3000,
                      iconTheme: {
                        primary: "#10B981",
                        secondary: "#fff",
                      },
                    },
                    error: {
                      duration: 5000,
                      iconTheme: {
                        primary: "#EF4444",
                        secondary: "#fff",
                      },
                    },
                  }}
                />
              </SocketProvider>
            </PresenceProvider>
          </SessionManagementProvider>
        </LanguageProvider>
      </ThemeProvider>
    </Provider>
  );
}
