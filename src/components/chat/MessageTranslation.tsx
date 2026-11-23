"use client";

import React, { useState } from "react";
import { Languages } from "lucide-react";
import { useAppSelector } from "@/store";
import apiService from "@/services/api";
import {
  TRANSLATION_LANGUAGE_NAMES,
  TranslationLanguage,
  detectLanguage,
  isForeignLanguage,
} from "@/lib/translation";

interface MessageTranslationProps {
  text: string;
}

/**
 * On-demand translation for a chat message (#83). The Translate button appears only when the
 * message looks like a different language than the user's preferred one. The translation is
 * shown inline below the original, which stays unchanged for reference.
 */
export function MessageTranslation({ text }: MessageTranslationProps) {
  const target = useAppSelector(
    (state) => (state.ui.translationLanguage ?? state.ui.language) as TranslationLanguage,
  );
  const [translation, setTranslation] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isForeignLanguage(text, target)) return null;

  const source = detectLanguage(text);
  const translate = async () => {
    if (translation) {
      setVisible((v) => !v);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await apiService.translateText(text, target);
      setTranslation(result.translatedText);
      setVisible(true);
    } catch {
      setError("Translation is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 text-xs" data-testid="message-translation">
      <button
        type="button"
        onClick={translate}
        disabled={loading}
        className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200 disabled:opacity-50"
      >
        <Languages className="h-3.5 w-3.5" aria-hidden="true" />
        {loading
          ? "Translating…"
          : visible
            ? "Hide translation"
            : `Translate to ${TRANSLATION_LANGUAGE_NAMES[target]}`}
      </button>
      {visible && translation && (
        <div
          lang={target}
          className="mt-2 rounded-md border border-gray-700 bg-gray-800/60 p-2 text-sm text-gray-100"
        >
          <p className="mb-1 text-xs text-gray-400">
            Translated{source ? ` from ${TRANSLATION_LANGUAGE_NAMES[source]}` : ""} • original shown above
          </p>
          <p>{translation}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default MessageTranslation;
