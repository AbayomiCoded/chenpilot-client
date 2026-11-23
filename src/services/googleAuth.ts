// Google Authentication Service
import apiService from "./api";

interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

interface GoogleAuthConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

class GoogleAuthService {
  private isInitialized = false;
  private clientId: string;

  constructor() {
    this.clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  }

  async initialize(): Promise<void> {
    if (
      this.isInitialized ||
      typeof window === "undefined" ||
      !document?.head
    ) {
      return;
    }

    return new Promise((resolve, reject) => {
      // Load Google Identity Services script
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;

      script.onload = () => {
        if (window.google && window.google.accounts) {
          this.isInitialized = true;
          resolve();
        } else {
          reject(new Error("Google Identity Services failed to load"));
        }
      };

      script.onerror = () => {
        reject(new Error("Failed to load Google Identity Services script"));
      };

      document.head.appendChild(script);
    });
  }

  async signIn(): Promise<{
    success: boolean;
    token?: string;
    error?: string;
  }> {
    try {
      if (!this.clientId) {
        return { success: false, error: "Google Client ID not configured" };
      }

      if (!this.isInitialized) {
        await this.initialize();
      }

      if (typeof window === "undefined" || !window.google?.accounts) {
        return {
          success: false,
          error: "Google Identity Services not available",
        };
      }

      return new Promise((resolve) => {
        const config: GoogleAuthConfig = {
          client_id: this.clientId,
          callback: async (response: GoogleCredentialResponse) => {
            try {
              // Send the credential to our backend
              const result = await apiService.googleAuth(response.credential);

              if (result.success) {
                resolve({ success: true, token: result.data.token });
              } else {
                resolve({
                  success: false,
                  error: result.message || "Google authentication failed",
                });
              }
            } catch (error: any) {
              resolve({
                success: false,
                error: error.message || "Failed to authenticate with Google",
              });
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        };

        // Render the Google Sign-In button
        if (window.google && window.google.accounts) {
          window.google.accounts.id.initialize(config);
          window.google.accounts.id.prompt();
        } else {
          resolve({
            success: false,
            error: "Google Identity Services not available",
          });
        }
      });
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Google authentication failed",
      };
    }
  }

  renderButton(
    elementId: string,
    options?: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      text?: "signin_with" | "signup_with" | "continue_with" | "signin";
      shape?: "rectangular" | "pill" | "circle" | "square";
      logo_alignment?: "left" | "center";
      width?: number;
    },
  ): void {
    if (!this.isInitialized || typeof window === "undefined") {
      console.error("Google Auth not initialized");
      return;
    }

    const defaultOptions = {
      theme: "outline" as const,
      size: "large" as const,
      text: "signin_with" as const,
      shape: "rectangular" as const,
      logo_alignment: "left" as const,
      width: 250,
      ...options,
    };

    if (window.google && window.google.accounts) {
      window.google.accounts.id.renderButton(
        document.getElementById(elementId),
        defaultOptions,
      );
    }
  }

  signOut(): void {
    if (this.isInitialized && window.google && window.google.accounts) {
      window.google.accounts.id.disableAutoSelect();
    }
  }
}

// Extend Window interface for Google Identity Services
declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: GoogleAuthConfig) => void;
          prompt: () => void;
          renderButton: (element: HTMLElement | null, options: any) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

// Create and export a singleton instance
export const googleAuthService = new GoogleAuthService();
export default googleAuthService;
