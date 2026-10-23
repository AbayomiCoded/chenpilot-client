'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-dark.css';
import { escapeHtml, sanitizeLanguage } from '@/utils/markdownPolicy';

interface CodeBlockProps {
  children: string;
  className?: string;
  inline?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ children, className, inline }) => {
  const [copied, setCopied] = useState(false);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
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
        onClick={handleCopy}
        className="absolute top-2 right-12 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 rounded"
        title="Copy code"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>

      {/* Code Content */}
      <pre className="overflow-x-auto p-4 text-sm">
        <code
          className={`font-mono text-gray-100 ${language ? `hljs language-${language}` : 'hljs'}`}
          dangerouslySetInnerHTML={{ __html: highlightedCode }}
        />
      </pre>
    </div>
  );
};
