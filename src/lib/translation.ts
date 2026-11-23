/**
 * Message translation helpers (#83).
 *
 * Detection is a lightweight client-side heuristic for the app's languages (en, ar, es, fr):
 * script for Arabic, common words for the Latin-script languages. It only decides whether to
 * offer the Translate button; the backend does the actual translation (`POST /translate`).
 */
export type TranslationLanguage = "en" | "ar" | "es" | "fr";

export const TRANSLATION_LANGUAGE_NAMES: Record<TranslationLanguage, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
};

export const TRANSLATION_LANGUAGE_KEY = "translation_language";

const COMMON_WORDS: Record<Exclude<TranslationLanguage, "ar">, string[]> = {
  en: ["the", "and", "is", "you", "your", "what", "with", "for", "this", "are", "have", "my"],
  es: ["el", "la", "los", "las", "que", "de", "y", "es", "por", "para", "con", "una", "mi", "tu", "cómo", "qué"],
  fr: ["le", "la", "les", "des", "est", "et", "que", "pour", "avec", "une", "mon", "vous", "je", "pas", "sur"],
};

/** Best-guess language of `text`, or null when there isn't enough signal. */
export function detectLanguage(text: string): TranslationLanguage | null {
  if (!text || !text.trim()) return null;
  const arabic = (text.match(/[؀-ۿ]/g) ?? []).length;
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters > 0 && arabic / letters > 0.3) return "ar";

  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 3) return null;
  let best: TranslationLanguage | null = null;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(COMMON_WORDS) as Array<[TranslationLanguage, string[]]>) {
    const score = words.filter((w) => list.includes(w)).length;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}

/** Whether a message should offer translation into `target`. */
export function isForeignLanguage(text: string, target: TranslationLanguage): boolean {
  const detected = detectLanguage(text);
  return detected !== null && detected !== target;
}

/** Saved "translate messages into" preference, or null to follow the app language. */
export function readTranslationLanguage(): TranslationLanguage | null {
  try {
    const value = window.localStorage.getItem("translation_language");
    return value === "en" || value === "ar" || value === "es" || value === "fr" ? value : null;
  } catch {
    return null;
  }
}

export function saveTranslationLanguage(lang: TranslationLanguage | null): void {
  try {
    if (lang) window.localStorage.setItem("translation_language", lang);
    else window.localStorage.removeItem("translation_language");
  } catch {
    // Storage denied: keep the in-memory preference only
  }
}
