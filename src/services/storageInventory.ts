import type { User } from '@/types';

/**
 * Inventory of every browser storage key the client uses (#256). Adding a key without listing
 * it here fails `storageInventory.test.ts`. Keep SECURITY.md "Browser Storage Inventory" in sync.
 */
export interface StorageKeyInfo {
  key: string;
  area: 'localStorage' | 'sessionStorage';
  /** Module that writes the key. */
  owner: string;
  lifetime: string;
  /** User-scoped keys are removed by `clearUserScopedStorage()` on logout. */
  userScoped: boolean;
  sensitivity: 'credential' | 'personal' | 'preference';
  contents: string;
}

export const STORAGE_INVENTORY: readonly StorageKeyInfo[] = [
  {
    key: 'auth_token',
    area: 'localStorage',
    owner: 'src/services/api.ts, src/store/slices/authSlice.ts',
    lifetime: 'Until logout, refresh failure or token rejection',
    userScoped: true,
    sensitivity: 'credential',
    contents: 'Bearer JWT for API calls',
  },
  {
    key: 'user_data',
    area: 'localStorage',
    owner: 'src/store/slices/authSlice.ts',
    lifetime: 'Until logout or refresh failure',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Minimized profile (id, name, email, account flags); no wallet address or public key',
  },
  {
    key: 'session_expiration',
    area: 'localStorage',
    owner: 'src/services/sessionService.ts',
    lifetime: 'Until logout or session end',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Session expiry timestamp shared across tabs',
  },
  {
    key: 'refresh_token',
    area: 'localStorage',
    owner: 'src/services/api.ts (legacy; never written, only removed)',
    lifetime: 'Removed on logout',
    userScoped: true,
    sensitivity: 'credential',
    contents: 'Legacy key; refresh tokens are HTTP-only cookies',
  },
  {
    key: 'chat_history',
    area: 'localStorage',
    owner: 'src/store/slices/chatSlice.ts',
    lifetime: 'Until logout or chat deletion',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Chat messages per conversation; prompts can include wallet addresses and amounts',
  },
  {
    key: 'conversations',
    area: 'localStorage',
    owner: 'src/store/slices/chatSlice.ts',
    lifetime: 'Until logout or conversation deletion',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Conversation titles and metadata',
  },
  {
    key: 'messageQueue',
    area: 'localStorage',
    owner: 'src/store/slices/chatSlice.ts',
    lifetime: 'Until sent after reconnecting, or logout',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Prompts queued while offline',
  },
  {
    key: 'chat_drafts',
    area: 'localStorage',
    owner: 'src/lib/accountDeletion.ts (removed on account deletion)',
    lifetime: 'Until logout or account deletion',
    userScoped: true,
    sensitivity: 'personal',
    contents: 'Unsent chat drafts',
  },
  {
    key: 'mfa_secret',
    area: 'localStorage',
    owner: 'src/services/auth.service.ts (defensive cleanup only; never written)',
    lifetime: 'Removed when MFA setup is cancelled, and on logout',
    userScoped: true,
    sensitivity: 'credential',
    contents: 'Must never hold an MFA secret; also cleared from sessionStorage',
  },
  {
    key: 'mfa_recovery_codes',
    area: 'localStorage',
    owner: 'src/services/auth.service.ts (defensive cleanup only; never written)',
    lifetime: 'Removed when MFA setup is cancelled, and on logout',
    userScoped: true,
    sensitivity: 'credential',
    contents: 'Must never hold MFA recovery codes; also cleared from sessionStorage',
  },
  {
    key: 'theme',
    area: 'localStorage',
    owner: 'src/store/slices/uiSlice.ts, src/components/providers/ThemeProvider.tsx',
    lifetime: 'Persistent device preference',
    userScoped: false,
    sensitivity: 'preference',
    contents: 'light | dark',
  },
  {
    key: 'language',
    area: 'localStorage',
    owner: 'src/store/slices/uiSlice.ts, src/lib/i18n/i18n.ts',
    lifetime: 'Persistent device preference',
    userScoped: false,
    sensitivity: 'preference',
    contents: 'UI language code',
  },
];

export const USER_SCOPED_STORAGE_KEYS = STORAGE_INVENTORY.filter((entry) => entry.userScoped).map(
  (entry) => entry.key,
);

/**
 * Remove every user-scoped key and all session storage (#256). Device preferences (theme,
 * language) are kept. Safe to call during SSR and when storage access throws.
 */
export function clearUserScopedStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of USER_SCOPED_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.sessionStorage.clear();
  } catch (error) {
    console.warn('Failed to clear user storage:', (error as Error)?.message);
  }
}

/** Profile fields kept in `user_data`; wallet identifiers are re-fetched from the API instead. */
export type PersistedUser = Pick<
  User,
  'id' | 'name' | 'email' | 'authProvider' | 'isEmailVerified' | 'tokenType' | 'isDeployed' | 'isFunded' | 'createdAt' | 'updatedAt'
>;

/** Minimize a user before persisting it (#256): drops the wallet address and public key. */
export function toPersistedUser(user: User): PersistedUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    authProvider: user.authProvider,
    isEmailVerified: user.isEmailVerified,
    tokenType: user.tokenType,
    isDeployed: user.isDeployed,
    isFunded: user.isFunded,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** Rebuild a `User` from persisted data; wallet fields stay empty until the profile is fetched. */
export function fromPersistedUser(data: PersistedUser): User {
  return { ...data, address: '', publicKey: '' } as User;
}
