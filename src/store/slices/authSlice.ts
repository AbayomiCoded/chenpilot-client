import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { User, LoginRequest, RegisterRequest } from "@/types";
import apiService from "@/services/api";
import { normalizeAuthError } from "@/services/auth.service";
import { clearUserScopedStorage, fromPersistedUser, toPersistedUser } from "@/services/storageInventory";

export const LOGIN_FIELDS = ["email", "password"] as const;
export const REGISTER_FIELDS = ["name", "email", "password"] as const;

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionExpirationTime: number | null;
  isSessionWarningActive: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  sessionExpirationTime: null,
  isSessionWarningActive: false,
};

// Async thunks
export const login = createAsyncThunk(
  "auth/login",
  async (credentials: LoginRequest) => {
    // Mock login - always succeed
    const mockUser: User = {
      id: "mock-user-id",
      email: credentials.email,
      name: "Mock User",
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
      isDeployed: true,
      isFunded: true,
      tokenType: "XLM",
      authProvider: "email",
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const mockToken = "mock-jwt-token";
    return { user: mockUser, token: mockToken };
  },
);

export const register = createAsyncThunk(
  "auth/register",
  async (userData: RegisterRequest) => {
    // Mock register - always succeed
    const mockUser: User = {
      id: "mock-user-id",
      email: userData.email,
      name: userData.name || "Mock User",
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
      isDeployed: true,
      isFunded: true,
      tokenType: "XLM",
      authProvider: "email",
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const mockToken = "mock-jwt-token";
    return { user: mockUser, token: mockToken };
  },
);

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await apiService.logout();
  } catch (error: unknown) {
    // Even if logout fails on server, clear local state
    console.error("Logout error:", error);
  }
});

export const loadUser = createAsyncThunk("auth/loadUser", async () => {
  // Mock load user - return mock user
  const mockUser: User = {
    id: "mock-user-id",
    email: "mock@example.com",
    name: "Mock User",
    address: "0x1234567890abcdef",
    publicKey: "0xabcdef1234567890",
    isDeployed: true,
    isFunded: true,
    tokenType: "XLM",
    authProvider: "email",
    isEmailVerified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return mockUser;
});

export const updateProfile = createAsyncThunk(
  "auth/updateProfile",
  async (userData: Partial<User>) => {
    // Mock update profile - return updated mock user
    const mockUser: User = {
      id: "mock-user-id",
      email: userData.email || "mock@example.com",
      name: userData.name || "Mock User",
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
      isDeployed: true,
      isFunded: true,
      tokenType: "XLM",
      authProvider: "email",
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return mockUser;
  },
);

export const changePassword = createAsyncThunk(
  "auth/changePassword",
  async () => {
    // Mock change password - always succeed
    return { success: true };
  },
);

export const googleAuth = createAsyncThunk(
  "auth/googleAuth",
  async (credential: string) => {
    const mockUser: User = {
      id: "mock-google-user-id",
      email: "mockgoogle@example.com",
      name: "Mock Google User",
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
      isDeployed: true,
      isFunded: true,
      tokenType: "XLM",
      authProvider: "google",
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { user: mockUser, token: credential };
  },
);

export const refreshToken = createAsyncThunk(
  "auth/refreshToken",
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiService.refreshToken();
      return { token: response.token };
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message || "Token refresh failed",
      );
    }
  },
);

export const fetchProfile = createAsyncThunk(
  "auth/fetchProfile",
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiService.getMe();
      if (response.success) return response.data;
      return rejectWithValue((response as { message?: string }).message);
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message || "Failed to fetch profile",
      );
    }
  },
);

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setToken: (state, action: PayloadAction<string>) => {
      state.token = action.payload;
      state.isAuthenticated = true;
    },
    clearAuth: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.error = null;
      state.sessionExpirationTime = null;
      state.isSessionWarningActive = false;
      // Clear session from localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("session_expiration");
      }
    },
    setSessionExpirationTime: (state, action: PayloadAction<number | null>) => {
      state.sessionExpirationTime = action.payload;
    },
    setSessionWarningActive: (state, action: PayloadAction<boolean>) => {
      state.isSessionWarningActive = action.payload;
    },
    initializeAuth: (state) => {
      // Restore persisted auth state from localStorage.
      // If no real token exists we leave the state as unauthenticated so the
      // app routes the user to the login page — mock data is only used when
      // the env variable NEXT_PUBLIC_USE_MOCK_AUTH is explicitly set to 'true'.
      if (typeof window === "undefined") return;

      const useMock = process.env.NEXT_PUBLIC_USE_MOCK_AUTH === "true";

      const storedToken = localStorage.getItem("auth_token");
      const storedUser = localStorage.getItem("user_data");

      if (storedToken && storedUser) {
        // Real credentials from a previous session.
        try {
          state.token = storedToken;
          state.user = JSON.parse(storedUser) as User;
          state.isAuthenticated = true;
        } catch {
          // Corrupt data — fall through to the unauthenticated default.
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user_data");
        }
      } else if (useMock) {
        // Development convenience: no backend needed when the flag is set.
        const mockUser: User = {
          id: "mock-user-id",
          email: "mock@example.com",
          name: "Mock User",
          address: "0x1234567890abcdef",
          publicKey: "0xabcdef1234567890",
          isDeployed: true,
          isFunded: true,
          tokenType: "XLM",
          authProvider: "email",
          isEmailVerified: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        state.user = mockUser;
        state.token = "mock-jwt-token";
        state.isAuthenticated = true;
      }
      // else: leave state.isAuthenticated = false → app will redirect to /auth/login
    },
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        // Save to localStorage for persistence
        if (typeof window !== "undefined") {
          localStorage.setItem("auth_token", action.payload.token);
          // Persist a minimized profile only; no wallet address or public key (#256)
          localStorage.setItem(
            "user_data",
            JSON.stringify(toPersistedUser(action.payload.user)),
          );
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        // Payload is a NormalizedAuthError (#258); keep only the safe general message in state
        state.error =
          (action.payload as { message?: string } | undefined)?.message ??
          action.error.message ??
          "Authentication failed";
        state.isAuthenticated = false;
      })
      // Register
      .addCase(register.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        // Save to localStorage for persistence
        if (typeof window !== "undefined") {
          localStorage.setItem("auth_token", action.payload.token);
          // Persist a minimized profile only; no wallet address or public key (#256)
          localStorage.setItem(
            "user_data",
            JSON.stringify(toPersistedUser(action.payload.user)),
          );
        }
      })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false;
        // Payload is a NormalizedAuthError (#258); keep only the safe general message in state
        state.error =
          (action.payload as { message?: string } | undefined)?.message ??
          action.error.message ??
          "Authentication failed";
        state.isAuthenticated = false;
      })
      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.error = null;
        state.sessionExpirationTime = null;
        state.isSessionWarningActive = false;
        // Clear every user-scoped key on logout (#256)
        clearUserScopedStorage();
      })
      // Load User
      .addCase(loadUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(loadUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(loadUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.token = null;
      })
      // Update Profile
      .addCase(updateProfile.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        state.error = null;
      })
      .addCase(updateProfile.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Change Password
      .addCase(changePassword.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Google Auth
      .addCase(googleAuth.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(googleAuth.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(googleAuth.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      })
      // Refresh Token
      .addCase(refreshToken.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.token;
        state.isAuthenticated = true;
        state.error = null;
        // Update localStorage
        if (typeof window !== "undefined") {
          localStorage.setItem("auth_token", action.payload.token);
        }
      })
      .addCase(refreshToken.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
        state.token = null;
        // Clear localStorage on refresh failure
        if (typeof window !== "undefined") {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user_data");
        }
      })
      // Fetch Profile
      .addCase(fetchProfile.fulfilled, (state, action) => {
        state.user = action.payload;
      });
  },
});

export const {
  clearError,
  setToken,
  clearAuth,
  initializeAuth,
  setSessionExpirationTime,
  setSessionWarningActive,
} = authSlice.actions;
export default authSlice.reducer;
