import { createSlice, PayloadAction, createAction } from "@reduxjs/toolkit";
// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetryStatus {
  label: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: number;
}

export interface ThemeState {
  mode: "light" | "dark";
  language: "en" | "ar" | "es" | "fr";
  retryStatus: RetryStatus | null;
  sidebarOpen: boolean;
  notifications: unknown[];
  modals: Record<string, boolean>;
}

const initialState: ThemeState = {
  mode: "dark", // Default to dark mode
  language: "en", // Default to English
  retryStatus: null,
  sidebarOpen: false,
  notifications: [],
  modals: {},
};

// Create action for initialization
export const initializeUI = createAction("ui/initialize", () => {
  // Get theme and language from localStorage or use defaults
  const savedTheme =
    typeof window !== "undefined"
      ? (localStorage.getItem("theme") as "light" | "dark" | null)
      : null;

  const savedLanguage =
    typeof window !== "undefined"
      ? (localStorage.getItem("language") as "en" | "ar" | "es" | "fr" | null)
      : null;

  return {
    payload: {
      theme: savedTheme || "dark",
      language: savedLanguage || "en",
    },
  };
});

// ─── Slice ────────────────────────────────────────────────────────────────────

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.mode = state.mode === "light" ? "dark" : "light";
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", state.mode);
      }
    },
    setTheme: (state, action: PayloadAction<"light" | "dark">) => {
      state.mode = action.payload;
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", state.mode);
      }
    },
    setLanguage: (state, action: PayloadAction<"en" | "ar" | "es" | "fr">) => {
      state.language = action.payload;
      // Save to localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem("language", state.language);
      }
    },
    /**
     * Called by the retry interceptor before each retry attempt.
     * Overwrites any previous status with the latest attempt info.
     */
    setRetryStatus: (state, action: PayloadAction<RetryStatus>) => {
      state.retryStatus = action.payload;
    },
    /**
     * Called by the retry interceptor when the request finally succeeds,
     * permanently fails, or is not eligible for retry.
     */
    clearRetryStatus: (state) => {
      state.retryStatus = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(initializeUI, (state, action) => {
      state.mode = action.payload.theme;
      state.language = action.payload.language;
    });
  },
});

export const {
  toggleTheme,
  setTheme,
  setLanguage,
  setRetryStatus,
  clearRetryStatus,
} =
  uiSlice.actions;
export default uiSlice.reducer;
