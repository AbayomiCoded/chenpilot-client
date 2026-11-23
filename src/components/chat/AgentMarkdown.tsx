"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import {
  EXTERNAL_LINK_REL,
  isExternalLink,
  markdownUrlTransform,
  sanitizeLinkUrl,
} from "@/utils/markdownPolicy";

interface AgentMarkdownProps {
  children: string;
}

/**
 * Renders untrusted agent Markdown under the safe URL/HTML policy in `@/utils/markdownPolicy` (#263).
 */
export function AgentMarkdown({ children }: AgentMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Raw HTML is dropped, never rendered (no rehype-raw / sanitizer configured)
      skipHtml
      urlTransform={markdownUrlTransform}
      components={{
        a: ({ href, children, node: _node, ...props }: any) => {
          const safeHref = sanitizeLinkUrl(href);
          if (!safeHref) {
            // Unsafe or empty URL: keep the text, drop the link
            return <span data-unsafe-link="">{children}</span>;
          }
          const external = isExternalLink(safeHref);
          return (
            <a
              {...props}
              href={safeHref}
              className="text-purple-300 underline hover:text-purple-200"
              {...(external ? { target: "_blank", rel: EXTERNAL_LINK_REL } : {})}
            >
              {children}
            </a>
          );
        },
        img: ({ src, alt }: any) => {
          // Images are not loaded automatically; show a link to them instead
          const safeSrc = sanitizeLinkUrl(typeof src === "string" ? src : undefined);
          const label = alt || "image";
          if (!safeSrc || !isExternalLink(safeSrc)) {
            return <span>[{label}]</span>;
          }
          return (
            <a
              href={safeSrc}
              target="_blank"
              rel={EXTERNAL_LINK_REL}
              className="text-purple-300 underline hover:text-purple-200"
            >
              [{label}]
            </a>
          );
        },
        p: ({ children, node: _node, ...props }: any) => (
          <p className="mb-3 last:mb-0" {...props}>
            {children}
          </p>
        ),
        strong: ({ children, node: _node, ...props }: any) => (
          <strong className="font-semibold text-white" {...props}>
            {children}
          </strong>
        ),
        em: ({ children, node: _node, ...props }: any) => (
          <em className="italic text-gray-300" {...props}>
            {children}
          </em>
        ),
        code: ({ inline, className, children }: any) => {
          const text = String(children).replace(/\n$/, "");
          // react-markdown v9+ no longer passes `inline`; fenced blocks have a language class or newlines
          const isInline = inline ?? (!className && !text.includes("\n"));
          return (
            <CodeBlock className={className} inline={isInline}>
              {text}
            </CodeBlock>
          );
        },
        pre: ({ children }: any) => <>{children}</>,
        ul: ({ children, node: _node, ...props }: any) => (
          <ul className="list-disc list-inside mb-3 space-y-1" {...props}>
            {children}
          </ul>
        ),
        ol: ({ children, node: _node, ...props }: any) => (
          <ol className="list-decimal list-inside mb-3 space-y-1" {...props}>
            {children}
          </ol>
        ),
        li: ({ children, node: _node, ...props }: any) => (
          <li className="text-gray-200" {...props}>
            {children}
          </li>
        ),
        h1: ({ children, node: _node, ...props }: any) => (
          <h1 className="text-2xl font-bold text-white mb-4" {...props}>
            {children}
          </h1>
        ),
        h2: ({ children, node: _node, ...props }: any) => (
          <h2 className="text-xl font-bold text-white mb-3" {...props}>
            {children}
          </h2>
        ),
        h3: ({ children, node: _node, ...props }: any) => (
          <h3 className="text-lg font-semibold text-white mb-2" {...props}>
            {children}
          </h3>
        ),
        blockquote: ({ children, node: _node, ...props }: any) => (
          <blockquote
            className="border-l-4 border-purple-500 pl-4 italic text-gray-300 my-4"
            {...props}
          >
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default AgentMarkdown;
