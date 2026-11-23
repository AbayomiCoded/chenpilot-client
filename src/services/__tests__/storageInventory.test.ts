import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  STORAGE_INVENTORY,
  USER_SCOPED_STORAGE_KEYS,
  clearUserScopedStorage,
  fromPersistedUser,
  toPersistedUser,
} from '../storageInventory';
import type { User } from '@/types';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const user: User = {
  id: 'u1',
  email: 'ada@example.test',
  name: 'Ada',
  address: 'GABCDEFWALLETADDRESS',
  publicKey: 'GPUBLICKEYVALUE',
  isDeployed: true,
  isFunded: true,
  tokenType: 'XLM',
  authProvider: 'email',
  isEmailVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('browser storage inventory (#256)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('documents every storage key used in src', () => {
    const used = new Map<string, string>();
    const pattern = /(localStorage|sessionStorage)\.(setItem|getItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g;
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) used.set(match[3], relative(SRC, file));
    }

    const documented = new Set(STORAGE_INVENTORY.map((entry) => entry.key));
    const undocumented = [...used.entries()].filter(([key]) => !documented.has(key));
    expect(undocumented).toEqual([]);
    expect(used.size).toBeGreaterThan(0);
  });

  it('classifies credentials and personal data as user-scoped', () => {
    for (const entry of STORAGE_INVENTORY) {
      if (entry.sensitivity !== 'preference') {
        expect(entry.userScoped).toBe(true);
      }
    }
  });

  it('clears all user-scoped keys and session storage but keeps device preferences', () => {
    for (const key of USER_SCOPED_STORAGE_KEYS) localStorage.setItem(key, 'x');
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('language', 'fr');
    sessionStorage.setItem('anything', 'x');

    clearUserScopedStorage();

    for (const key of USER_SCOPED_STORAGE_KEYS) expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('language')).toBe('fr');
  });

  it('persists a minimized user without wallet identifiers', () => {
    const persisted = JSON.stringify(toPersistedUser(user));
    expect(persisted).not.toContain(user.address);
    expect(persisted).not.toContain(user.publicKey);
    expect(persisted).toContain(user.email);

    const restored = fromPersistedUser(JSON.parse(persisted));
    expect(restored).toMatchObject({ id: 'u1', address: '', publicKey: '' });
  });
});
