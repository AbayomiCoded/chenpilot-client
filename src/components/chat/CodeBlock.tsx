'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, AlertCircle } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import { escapeHtml, sanitizeLanguage } from '@/utils/markdownPolicy';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Write text to the clipboard (#268). Resolves only after the write completes; rejects when the
 * Clipboard API is missing (insecure context, old browser) or permission is denied.
 */
export async function writeToClipboard(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    throw new Error('Clipboard API unavailable');
  }
  await navigator.clipboard.writeText(text);
}

/** Select an element's text so the user can copy it manually (fallback for #268). */
export function selectElementText(element: HTMLElement | null): boolean {
  if (!element || typeof window === 'undefined' || !window.getSelection) return false;
  const selection = window.getSelection();
  if (!selection) return false;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.addRange(range);
  return true;
}

const FEEDBACK_MS = 2000;

interface CodeBlockProps {
  children: string;
  className?: string;
  inline?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ children, className, inline }) => {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const codeRef = useRef<HTMLElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  // Extract language from className (e.g., "language-javascript" -> "javascript").
  // Restricted to a safe identifier because it is interpolated into class names (#263).
  const language = sanitizeLanguage(className?.replace(/language-/, ''));

  // Highlight code if not inline. The result goes into innerHTML, so every path must be
  // HTML-safe: highlight.js escapes its input, and the fallback is escaped explicitly (#263).
  const getHighlightedCode = () => {
    if (inline) return escapeHtml(children);

    try {
      if (language && hljs.getLanguage(language)) {
        return hljs.highlight(children, { language }).value;
      }
      // Auto-detect language
      return hljs.highlightAuto(children).value;
    } catch (error) {
      console.error('Syntax highlighting error:', error);
      return escapeHtml(children);
    }
  };

  // Feedback is shown only after the clipboard write settles (#268). On failure the code is
  // selected so the user can copy it with the keyboard.
  const handleCopy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    let next: CopyState;
    try {
      await writeToClipboard(children);
      next = 'copied';
    } catch (error) {
      console.warn('Failed to copy code:', (error as Error)?.message);
      selectElementText(codeRef.current);
      next = 'failed';
    }
    setCopyState(next);
    resetTimer.current = setTimeout(() => setCopyState('idle'), next === 'failed' ? FEEDBACK_MS * 3 : FEEDBACK_MS);
  };

  if (inline) {
    return (
      <code className="bg-gray-800 text-green-400 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    );
  }

  const highlightedCode = getHighlightedCode();

  return (
    <div className="relative group bg-gray-900 rounded-lg border border-gray-700 overflow-hidden my-4">
      {/* Language Badge */}
      {language && (
        <div className="absolute top-0 right-0 px-3 py-1 bg-gray-800 text-gray-400 text-xs font-mono rounded-bl-lg">
          {language}
        </div>
      )}

      {/* Copy Button */}
      <button
        type="button"
        onClick={handleCopy}
        className={`absolute top-2 right-12 transition-opacity p-2 text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 rounded focus-visible:opacity-100 ${
          copyState === 'idle' ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
        }`}
        title="Copy code"
        aria-label={copyState === 'copied' ? 'Copied' : 'Copy code'}
      >
        {copyState === 'copied' ? (
          <Check className="h-4 w-4 text-green-400" aria-hidden="true" />
        ) : copyState === 'failed' ? (
          <AlertCircle className="h-4 w-4 text-red-400" aria-hidden="true" />
        ) : (
          <Copy className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Announced result of the last copy attempt */}
      <span role="status" aria-live="polite" className={copyState === 'failed' ? 'block px-4 pt-3 text-xs text-red-300' : 'sr-only'}>
        {copyState === 'copied' && 'Code copied to clipboard'}
        {copyState === 'failed' && "Couldn't copy automatically. The code is selected; press Ctrl+C (⌘C on Mac) to copy it."}
      </span>

      {/* Code Content */}
      <pre className="overflow-x-auto p-4 text-sm select-text">
        <code
          ref={codeRef}
          className={`font-mono text-gray-100 ${language ? `hljs language-${language}` : 'hljs'}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
};
