'use client';

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useAppSelector } from '@/store';
import { getLanguageDirection, type Language } from '@/lib/i18n/i18n';

export type TextDirection = 'ltr' | 'rtl';

interface LanguageDirectionContextValue {
  language: Language;
  direction: TextDirection;
  isRtl: boolean;
}

const LanguageDirectionContext = createContext<LanguageDirectionContextValue>({
  language: 'en',
  direction: 'ltr',
  isRtl: false,
});

export function useLanguageDirection(): LanguageDirectionContextValue {
  return useContext(LanguageDirectionContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useAppSelector((state) => state.ui.language);
  const direction = getLanguageDirection(language);

  useEffect(() => {
    const htmlElement = document.documentElement;
    htmlElement.lang = language;
    htmlElement.dir = direction;
    htmlElement.dataset.direction = direction;

    // Apply RTL-specific styles for Arabic
    if (direction === 'rtl') {
      htmlElement.classList.add('rtl');
    } else {
      htmlElement.classList.remove('rtl');
    }
  }, [language, direction]);

  const value = useMemo<LanguageDirectionContextValue>(
    () => ({
      language,
      direction,
      isRtl: direction === 'rtl',
    }),
    [language, direction],
  );

  return (
    <LanguageDirectionContext.Provider value={value}>
      {children}
    </LanguageDirectionContext.Provider>
  );
}
