import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { THEME_INIT_SCRIPT, readSavedTheme, resolveTheme, saveTheme } from './theme';

const setSystemDark = (dark: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: dark && query.includes('dark'), media: query, addEventListener() {}, removeEventListener() {} }),
  });
};

// Runs the inline <head> script the same way the browser does before hydration
const runInitScript = () => new Function(THEME_INIT_SCRIPT)();

describe('theme preference (#296)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });
  afterEach(() => vi.restoreAllMocks());

  it('prefers an explicit saved choice over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('applies dark before hydration from the saved choice', () => {
    setSystemDark(false);
    localStorage.setItem('theme', 'dark');
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies light before hydration when the system prefers light and nothing is saved', () => {
    setSystemDark(false);
    document.documentElement.classList.add('dark');
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to the system preference when storage is denied', () => {
    setSystemDark(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(readSavedTheme()).toBeNull();
    expect(() => saveTheme('light')).not.toThrow();
    runInitScript();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
