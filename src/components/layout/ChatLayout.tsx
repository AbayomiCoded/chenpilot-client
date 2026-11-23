"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store";
import { logout } from "@/store/slices/authSlice";
import {
  startNewChat,
  loadChatHistory,
  loadConversationsLocally,
  deleteConversation,
  setCurrentConversation,
} from "@/store/slices/chatSlice";
import { ConversationManager } from "@/components/chat/ConversationManager";
import { ConversationExportMenu } from "@/components/chat/ConversationExportMenu";
import { DeleteConversationDialog } from "@/components/chat/DeleteConversationDialog";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/Button";
import toast from "react-hot-toast";
import { X, Menu, PanelLeft, Plus } from "lucide-react";
import { cn } from "@/utils/cn";
import Image from "next/image";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Conversation awaiting delete confirmation (#269)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  // ── Search ──
  const search = useChatSearch();
  const { isSearchOpen, openSearch, closeSearch, setQuery, goToNext, goToPrev, searchState, searchInputRef } = search;

  // Ctrl/Cmd+F – intercept only when focus is inside the chat route.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        // Only hijack the shortcut on the chat page.
        if (pathname?.startsWith('/chat')) {
          e.preventDefault();
          if (isSearchOpen) {
            searchInputRef.current?.focus();
          } else {
            openSearch();
          }
        }
      }
      if (e.key === 'Escape' && isSearchOpen) {
        closeSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pathname, isSearchOpen, openSearch, closeSearch, searchInputRef]);

  // Get chat history from Redux store
  const { chatHistory, currentConversation, conversations, messages } = useAppSelector(
    (state) => state.chat,
  );

  // Convert chat history object to array for display
  const chatHistoryList = React.useMemo(() => {
    return conversations
      .map((conversation) => {
        const messages = chatHistory[conversation.id] || conversation.messages || [];
        const lastMessage = messages[messages.length - 1];
        return {
          id: conversation.id,
          title: conversation.title?.trim() || "New Chat",
          lastMessage:
            typeof lastMessage?.content === "string" ? lastMessage.content : "",
          timestamp: lastMessage?.timestamp || conversation.updatedAt,
          messageCount: conversation.messageCount || messages.length,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 10); // Show last 10 conversations
  }, [chatHistory, conversations]);

  const profileMenuItems = [
    {
      name: "Dashboard",
      href: "/dashboard",
    },
    {
      name: "Contacts",
      href: "/contacts",
    },
    {
      name: "Settings",
      href: "/settings",
    },
  ];

  const handleNewChat = () => {
    dispatch(startNewChat());
    toast.success("Starting new chat...");
    router.push("/chat");
    setSidebarOpen(false);
  };

  const handleLoadChat = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    dispatch(loadChatHistory(conversationId));
    if (conversation) dispatch(setCurrentConversation(conversation));
    router.push(`/chat/${encodeURIComponent(conversationId)}`);
    setSidebarOpen(false);
  };

  const handleDeleteChat = (conversationId: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const conversation = conversations.find((item) => item.id === conversationId);
    setPendingDelete({ id: conversationId, title: conversation?.title ?? "This conversation" });
  };

  // Confirmed: cancel in-flight requests, drop late responses, then remove (#269)
  const confirmDeleteChat = async (conversationId: string) => {
    const wasOpen = currentConversation?.id === conversationId;
    setPendingDelete(null);
    await dispatch(deleteConversation(conversationId));
    toast.success("Chat deleted");
    if (wasOpen) router.push("/chat");
  };

  const handleNavigation = (href: string) => {
    router.push(href);
    setSidebarOpen(false);
    setProfileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await dispatch(logout()).unwrap();
      toast.success("Successfully logged out!");
      router.push("/auth/login");
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error || "Logout failed");
      toast.error(errorMessage);
    }
  };

  // Load conversations from localStorage on component mount
  React.useEffect(() => {
    dispatch(loadConversationsLocally());
  }, [dispatch]);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  const isChatRoute = pathname?.startsWith('/chat');

  return (
    <div className="h-screen flex flex-col lg:flex-row bg-gray-50 dark:bg-gray-900">
      {/* Mobile header with menu button */}
      <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <button
          id="mobile-menu-button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open navigation menu"
          className="p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <Image
              src="/chenpilot.png"
              alt="ChenPilot Logo"
              width={24}
              height={24}
              className="rounded-full object-cover"
            />
          </div>
          <h1
            className="text-lg font-thin text-gray-900 dark:text-white"
            style={{ fontFamily: "Manrope" }}
          >
            ChenPilot
          </h1>
        </div>
        <div className="w-10" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0 bg-gray-600 bg-opacity-75" />
        </div>
      )}

      {/* Sidebar */}
      <nav
        aria-label="Sidebar navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-[#2D1B69] shadow-lg transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          sidebarOpen
            ? "visible translate-x-0"
            : "invisible -translate-x-full lg:visible",
          sidebarCollapsed ? "w-16" : "w-72",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
            <div className="flex items-center space-x-2">
              {sidebarCollapsed ? (
                <button
                  onClick={toggleSidebar}
                  className="flex items-center hover:opacity-80 transition-opacity"
                  title="Expand sidebar"
                >
                  <Menu className="h-6 w-6 text-[#C4B5FD]" />
                </button>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <Image
                      src="/chenpilot.png"
                      alt="ChenPilot Logo"
                      width={32}
                      height={32}
                      className="rounded-full object-cover"
                    />
                  </div>
                  <span
                    className="text-xl font-thin text-[#C4B5FD] tracking-tight"
                    style={{ fontFamily: "Manrope" }}
                  >
                    ChenPilot
                  </span>
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {!sidebarCollapsed && (
              <div className="absolute top-4 right-4">
                <button
                  onClick={toggleSidebar}
                  className="p-2 text-[#C4B5FD] hover:bg-gray-800/50 rounded transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeft className="h-6 w-6" />
                </button>
              </div>
            )}

            {/* New Chat Button */}
            <div className="px-4 py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSidebarOpen(false);
                  document.getElementById("mobile-menu-button")?.focus();
                }}
                className="lg:hidden text-gray-400 hover:text-white"
              >
                {sidebarCollapsed ? (
                  <Plus className="h-5 w-5" />
                ) : (
                  <span>New Chat</span>
                )}
              </Button>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="px-4 py-4">
            <Button
              onClick={handleNewChat}
              className={cn(
                "w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl",
                sidebarCollapsed ? "px-3" : "px-4",
              )}
            >
              {sidebarCollapsed ? (
                <Plus className="h-5 w-5" />
              ) : (
                <span>New Chat</span>
              )}
            </Button>
          </div>

          {/* Export the active conversation (#96) */}
          {!sidebarCollapsed && (
            <div className="px-4 pb-3">
              <ConversationExportMenu
                messages={messages}
                conversationId={currentConversation?.id}
                title={currentConversation?.title}
              />
            </div>
          )}

          {/* Chat History */}
          <div className="flex-1 overflow-y-auto px-4">
            {!sidebarCollapsed && (
              <ConversationManager
                onDeleteConversation={(conv) => handleDeleteChat(conv.id)}
                onSelectConversation={(conv) => {
                  dispatch(loadChatHistory(conv.id));
                  dispatch(setCurrentConversation(conv));
                  router.push(`/chat/${encodeURIComponent(conv.id)}`);
                  setSidebarOpen(false);
                }}
              />
            )}
            {sidebarCollapsed && (
              <ul aria-label="Recent conversations" className="space-y-1">
                {chatHistoryList.slice(0, 5).map((chat) => (
                  <li key={chat.id}>
                    <button
                      onClick={() => handleLoadChat(chat.id)}
                      aria-label={chat.title}
                      aria-current={currentConversation?.id === chat.id ? "page" : undefined}
                      className="w-full p-1 rounded-lg hover:bg-gray-800/30 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
                      title={typeof chat.title === "string" ? chat.title : "Chat"}
                    >
                      <div className="w-full h-8 bg-gray-700/30 rounded flex items-center justify-center text-xs text-gray-400">
                        •
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Profile Section */}
          <div className="border-t border-gray-700 p-4">
            <div className="relative">
              <button
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className={cn(
                  "w-full flex items-center rounded-xl hover:bg-gray-800/50 transition-all duration-200",
                  sidebarCollapsed
                    ? "justify-center p-2"
                    : "justify-between p-3",
                )}
                title={sidebarCollapsed ? user?.name || user?.email : undefined}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {(user?.name || user?.email || "U")
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  </div>
                  {!sidebarCollapsed && (
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-medium text-white truncate">
                        {user?.name || "Test User"}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {user?.email || "test@example.com"}
                      </p>
                    </div>
                  )}
                </div>
                {!sidebarCollapsed &&
                  (profileMenuOpen ? (
                    <span className="text-gray-400">^</span>
                  ) : (
                    <span className="text-gray-400">v</span>
                  ))}
              </button>

                {/* Profile Menu Dropdown */}
                {profileMenuOpen && !sidebarCollapsed && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
                    {profileMenuItems.map((item) => {
                      return (
                        <button
                          key={item.name}
                          onClick={() => handleNavigation(item.href)}
                          className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700/50 transition-all duration-200"
                        >
                          <span>{item.name}</span>
                        </button>
                      );
                    })}
                    <div className="border-t border-gray-700">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-all duration-200"
                      >
                        <span>Sign Out</span>
                      </button>
                    );
                  })}
                  <div className="border-t border-gray-700">
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-200">Theme</span>
                      <ThemeToggle />
                    </div>
                  </div>
                  <div className="border-t border-gray-700">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center space-x-3 px-4 py-3 text-sm text-red-400 hover:bg-red-900/20 transition-all duration-200"
                    >
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {/* Page content */}
        <main
          id="main-content"
          tabIndex={-1}
          aria-label="Main content"
          className="flex-1 overflow-hidden"
        >
          {children}
        </main>
      </div>
      <DeleteConversationDialog
        conversation={pendingDelete}
        onConfirm={confirmDeleteChat}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
