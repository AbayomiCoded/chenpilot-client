"use client";

import React, { useState } from "react";
import { logger } from "../../utils/logger";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ChatMessage } from "@/types";
import { Copy, Check, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import ExecutionTrace from "./ExecutionTrace";
import { useAppDispatch } from "@/store";
import { setMessageFeedback } from "@/store/slices/chatSlice";
import { submitFeedback } from "@/services/feedbackService";
import type { MessageFeedback } from "@/types";

type DataRecord = Record<string, unknown>;

function isDataRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordList(value: unknown): DataRecord[] {
  return Array.isArray(value) ? value.filter(isDataRecord) : [];
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function displayField(record: DataRecord, key: string): string {
  return displayValue(record[key]);
}

function nestedRecord(record: DataRecord, key: string): DataRecord {
  const value = record[key];
  return isDataRecord(value) ? value : {};
}

const markdownComponents: Components = {
  p: ({ children, ...props }) => (
    <p className="mb-3 last:mb-0" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-white" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic text-gray-300" {...props}>
      {children}
    </em>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className?.includes('language-');
    return (
      <CodeBlock className={className} inline={inline} {...props}>
        {String(children).replace(/\n$/, '')}
      </CodeBlock>
    );
  },
  pre: ({ children }) => <>{children}</>,
  ul: ({ children, ...props }) => (
    <ul className="mb-3 list-disc list-inside space-y-1" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="mb-3 list-decimal list-inside space-y-1" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-gray-200" {...props}>
      {children}
    </li>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="mb-4 text-2xl font-bold text-white" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-3 text-xl font-bold text-white" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-2 text-lg font-semibold text-white" {...props}>
      {children}
    </h3>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-4 border-l-4 border-purple-500 pl-4 italic text-gray-300" {...props}>
      {children}
    </blockquote>
  ),
};

interface AgentMessageProps {
  message: ChatMessage;
  onCopy?: (text: string) => void;
  onReply?: (messageId: string) => void;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

export default function AgentMessage({
  message,
  onCopy,
  onReply,
  onRegenerate,
  canRegenerate = false,
}: AgentMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showFeedbackComment, setShowFeedbackComment] = useState(false);
  const [feedbackComment, setFeedbackComment] = useState("");
  const dispatch = useAppDispatch();

  const updateFeedback = (feedback: MessageFeedback | null) => {
    dispatch(setMessageFeedback({ messageId: message.id, feedback }));
    void submitFeedback(message.id, feedback);
  };

  const handlePositiveFeedback = () => {
    const selected = message.metadata?.feedback?.rating === "up";
    updateFeedback(
      selected
        ? null
        : { rating: "up", submittedAt: new Date().toISOString() },
    );
  };

  const handleNegativeFeedback = () => {
    if (message.metadata?.feedback?.rating === "down") {
      updateFeedback(null);
      setShowFeedbackComment(false);
      setFeedbackComment("");
      return;
    }
    setFeedbackComment("");
    setShowFeedbackComment(true);
  };

  const submitNegativeFeedback = () => {
    updateFeedback({
      rating: "down",
      comment: feedbackComment.trim() || undefined,
      submittedAt: new Date().toISOString(),
    });
    setShowFeedbackComment(false);
  };

  // Handle both string and object content
  const renderContent = () => {
    // Debug logging to see what content we're receiving
    logger.debug("[AgentMessage] Message content:", message.content);
    logger.debug("[AgentMessage] Content type:", typeof message.content);

    if (typeof message.content === "string") {
      return message.content;
    }

    if (typeof message.content === "object" && message.content !== null) {
      const content = message.content as DataRecord;
      logger.debug("[AgentMessage] Object content keys:", Object.keys(content));

      // Handle the new backend response format with vaults array
      if (Array.isArray(content.vaults)) {
        return renderVaultsContent(recordList(content.vaults), content.marketInsights);
      }

      // Handle troves positions response
      if (Array.isArray(content.positions)) {
        return renderPositionsContent(recordList(content.positions));
      }

      // Handle troves quote response
      if (content.vaultId && content.estimatedShares) {
        return renderQuoteContent(content);
      }

      // Handle deposit quote response with vault info
      if (content.vault && content.deposit) {
        return renderDepositQuoteContent(content);
      }

      // Handle troves strategies response
      if (Array.isArray(content.strategies)) {
        return renderStrategiesContent(recordList(content.strategies));
      }

      // Handle troves yield response
      if (content.vaultId && content.currentApy) {
        return renderYieldContent(content);
      }

      // Handle troves health response
      if (content.status && content.totalTvl) {
        return renderHealthContent(content);
      }

      // Handle deposit/withdraw/harvest responses
      if (content.success !== undefined) {
        return renderOperationContent(content);
      }

      // For other objects, return a generic message
      return "Operation completed successfully.";
    }

    return String(message.content || "");
  };

  const renderVaultsContent = (vaults: DataRecord[], marketInsights?: unknown) => {
    let content = `🏦 **Available Vaults (${vaults.length})**\n\n`;

    if (isDataRecord(marketInsights)) {
      const topPerformer = nestedRecord(marketInsights, 'topPerformer');
      const riskDistribution = nestedRecord(marketInsights, 'riskDistribution');
      content +=
        `📊 **Market Overview**\n` +
        `• Total TVL: ${displayField(marketInsights, 'totalTvl')}\n` +
        `• Average APY: ${displayField(marketInsights, 'averageApy')}\n` +
        `• Top Performer: ${displayField(topPerformer, 'name')} (${displayField(topPerformer, 'apy')})\n` +
        `• Risk Distribution: ${displayField(riskDistribution, 'highRisk')} High, ${displayField(riskDistribution, 'mediumRisk')} Medium, ${displayField(riskDistribution, 'lowRisk')} Low Risk\n\n`;
    }

    content +=
      `**Vault Details:**\n\n` +
      vaults
        .map(
          (vault) => {
            const fees = nestedRecord(vault, 'fees');
            return `**${displayField(vault, 'name')}**\n` +
              `• Asset: ${displayField(vault, 'asset')}\n` +
              `• APY: ${displayField(vault, 'apy')}\n` +
              `• TVL: ${displayField(vault, 'tvl')}\n` +
              `• Strategy: ${displayField(vault, 'strategy')}\n` +
              `• Min Deposit: ${displayField(vault, 'minDeposit')} ${displayField(vault, 'asset')}\n` +
              `• Risk Level: ${displayField(vault, 'riskLevel')}\n` +
              `• Fees: ${displayValue(fees.managementFee)} management, ${displayValue(fees.performanceFee)} performance\n`;
          },
        )
        .join("\n");

    return content;
  };

  const renderPositionsContent = (positions: DataRecord[]) => {
    if (positions.length === 0) {
      return "📊 **Your Positions**\n\nNo positions found.";
    }

    return (
      `📊 **Your Positions (${positions.length})**\n\n` +
      positions
        .map(
          (position) =>
            `**${displayField(position, 'vaultName')}**\n` +
            `• Asset: ${displayField(position, 'asset')}\n` +
            `• Shares: ${displayField(position, 'shares')}\n` +
            `• Assets: ${displayField(position, 'assets')}\n` +
            `• Estimated Value: $${displayField(position, 'estimatedValue')}\n` +
            `• APY: ${displayField(position, 'apy')}%\n` +
            `• Total Earned: $${displayField(position, 'totalEarned')}\n` +
            `• Deposited: ${displayField(position, 'depositedAt')}\n`,
        )
        .join("\n")
    );
  };

  const renderQuoteContent = (quote: DataRecord) => {
    return (
      `💰 **Deposit Quote**\n\n` +
      `• Vault: ${displayField(quote, 'vaultId')}\n` +
      `• Asset: ${displayField(quote, 'asset')}\n` +
      `• Amount: ${displayField(quote, 'amount')}\n` +
      `• Estimated Shares: ${displayField(quote, 'estimatedShares')}\n` +
      `• APY: ${displayField(quote, 'apy')}%\n` +
      `• Estimated Yield: $${displayField(quote, 'estimatedYield')}\n` +
      `• Time Horizon: ${displayField(quote, 'timeHorizon')}\n` +
      `• Fees: ${displayField(quote, 'fees')}\n`
    );
  };

  const renderDepositQuoteContent = (data: DataRecord) => {
    const vault = nestedRecord(data, 'vault');
    const deposit = nestedRecord(data, 'deposit');
    const yieldProjections = nestedRecord(data, 'yieldProjections');
    const fees = nestedRecord(data, 'fees');
    const riskAssessment = nestedRecord(data, 'riskAssessment');

    return (
      `💰 **${displayField(data, 'message')}**\n\n` +
      `**Vault Information:**\n` +
      `• Name: ${displayField(vault, 'name')}\n` +
      `• Asset: ${displayField(vault, 'asset')}\n` +
      `• APY: ${displayField(vault, 'apy')}\n` +
      `• TVL: ${displayField(vault, 'tvl')}\n` +
      `• Strategy: ${displayField(vault, 'strategy')}\n\n` +
      `**Deposit Details:**\n` +
      `• Amount: ${displayField(deposit, 'amount')} ${displayField(deposit, 'asset')}\n` +
      `• Estimated Shares: ${displayField(deposit, 'estimatedShares')}\n` +
      `• Share Price: ${displayField(deposit, 'sharePrice')}\n\n` +
      `**Yield Projections:**\n` +
      `• Daily: ${displayField(yieldProjections, 'daily')}\n` +
      `• Weekly: ${displayField(yieldProjections, 'weekly')}\n` +
      `• Monthly: ${displayField(yieldProjections, 'monthly')}\n` +
      `• Annual: ${displayField(yieldProjections, 'annual')}\n\n` +
      `**Fees:**\n` +
      `• Management Fee: ${displayField(fees, 'managementFee')} (${displayField(fees, 'managementFeeAmount')})\n` +
      `• Performance Fee: ${displayField(fees, 'performanceFee')} (${displayField(fees, 'performanceFeeAmount')})\n\n` +
      `**Risk Assessment:**\n` +
      `• Risk Level: ${displayField(riskAssessment, 'riskLevel')}\n` +
      `• Recommendation: ${displayField(riskAssessment, 'recommendation')}\n`
    );
  };

  const renderStrategiesContent = (strategies: DataRecord[]) => {
    return (
      `🎯 **Available Strategies (${strategies.length})**\n\n` +
      strategies
        .map(
          (strategy) => {
            const supportedAssets = Array.isArray(strategy.supportedAssets)
              ? strategy.supportedAssets.map(displayValue).join(', ')
              : displayValue(strategy.supportedAssets);
            return `**${displayField(strategy, 'name')}**\n` +
              `• Description: ${displayField(strategy, 'description')}\n` +
              `• Risk Level: ${displayField(strategy, 'riskLevel')}\n` +
              `• Target APY: ${displayField(strategy, 'targetApy')}%\n` +
              `• Current APY: ${displayField(strategy, 'currentApy')}%\n` +
              `• TVL: $${displayField(strategy, 'tvl')}\n` +
              `• Supported Assets: ${supportedAssets}\n` +
              `• Strategy Type: ${displayField(strategy, 'strategyType')}\n`;
          },
        )
        .join("\n")
    );
  };

  const renderYieldContent = (yieldData: DataRecord) => {
    return (
      `📈 **Yield Data for ${displayField(yieldData, 'vaultName')}**\n\n` +
      `• Asset: ${displayField(yieldData, 'asset')}\n` +
      `• Current APY: ${displayField(yieldData, 'currentApy')}%\n` +
      `• Historical APY: ${displayField(yieldData, 'historicalApy')}%\n` +
      `• TVL: $${displayField(yieldData, 'tvl')}\n` +
      `• Risk Level: ${displayField(yieldData, 'riskLevel')}\n` +
      `• Last Updated: ${displayField(yieldData, 'lastUpdated')}\n`
    );
  };

  const renderHealthContent = (health: DataRecord) => {
    return (
      `🏥 **Troves Health Status**\n\n` +
      `• Status: ${displayField(health, 'status')}\n` +
      `• Total TVL: $${displayField(health, 'totalTvl')}\n` +
      `• Total APY: ${displayField(health, 'totalApy')}%\n` +
      `• Vault Status: ${displayField(health, 'vaultStatus')}\n` +
      `• Recommendations: ${displayField(health, 'recommendations')}\n`
    );
  };

  const renderOperationContent = (operation: DataRecord) => {
    if (operation.success) {
      const quote = operation.quote;
      const vault = nestedRecord(operation, 'vault');
      return (
        `✅ **${displayValue(operation.message || 'Operation Successful')}**\n\n` +
        (quote
          ? `Quote: ${JSON.stringify(quote, null, 2)}\n`
          : "") +
        (operation.vault
          ? `Vault: ${displayField(vault, 'name')} (${displayField(vault, 'asset')})\n`
          : "") +
        (operation.note ? `\n${displayValue(operation.note)}` : "")
      );
    } else {
      return `❌ **Operation Failed**\n\n${displayValue(operation.message || 'Unknown error occurred')}`;
    }
  };

  const handleCopy = async () => {
    const content = renderContent();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (onCopy) onCopy(content);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  // Track a running offset so each text node in the markdown gets the right
  // global match index. Re-created on each component render, stable within
  // the single ReactMarkdown render pass.
  const offsetTracker = useMemo(
    () => ({ current: searchMatchOffset }),
    [searchMatchOffset]
  );

  /**
   * Wrap a child string (text node inside a ReactMarkdown component) with
   * HighlightedText, advancing the running offset by the number of matches.
   */
  const wrapChildren = (children: React.ReactNode): React.ReactNode => {
    if (!searchQuery) return children;
    if (typeof children === 'string') {
      const matchCount = findMatches(children, searchQuery).length;
      const offset = offsetTracker.current;
      offsetTracker.current += matchCount;
      return (
        <HighlightedText
          text={children}
          query={searchQuery}
          activeIndex={searchActiveIndex}
          matchOffset={offset}
        />
      );
    }
    return children;
  };

  return (
    <div className="text-white text-left group relative">
      <div className="prose prose-invert prose-lg max-w-none leading-relaxed pr-8">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {renderContent()}
        </ReactMarkdown>
        <AgentMarkdown>{renderContent()}</AgentMarkdown>
      </div>

      {/* Execution Trace */}
      {message.metadata?.executionTrace && (
        <ExecutionTrace trace={message.metadata.executionTrace} />
      )}

      {message.metadata?.status === "cancelled" && (
        <p className="mt-2 text-xs text-amber-400">cancelled</p>
      )}

      <div className="mt-2 flex items-center space-x-3">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <button
          type="button"
          aria-label="Helpful"
          aria-pressed={message.metadata?.feedback?.rating === "up"}
          onClick={handlePositiveFeedback}
          className={`flex items-center space-x-1 text-xs hover:text-white ${
            message.metadata?.feedback?.rating === "up" ? "text-green-400" : "text-gray-400"
          }`}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          <span>Helpful</span>
        </button>
        <button
          type="button"
          aria-label="Not helpful"
          aria-pressed={message.metadata?.feedback?.rating === "down"}
          onClick={handleNegativeFeedback}
          className={`flex items-center space-x-1 text-xs hover:text-white ${
            message.metadata?.feedback?.rating === "down" ? "text-red-400" : "text-gray-400"
          }`}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          <span>Not helpful</span>
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={!canRegenerate}
          className="flex items-center space-x-1 text-xs text-gray-400 hover:text-white disabled:opacity-40 disabled:hover:text-gray-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Regenerate</span>
        </button>
        {onReply && message.replyCount ? (
          <button
            type="button"
            onClick={() => onReply(message.id)}
            className="flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            <span>
              {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        ) : null}
      </div>
      {showFeedbackComment && (
        <form
          className="mt-3 max-w-sm space-y-2 rounded-lg border border-gray-700 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitNegativeFeedback();
          }}
        >
          <label className="block text-xs text-gray-300" htmlFor={`feedback-${message.id}`}>
            What could be improved? (optional)
          </label>
          <textarea
            id={`feedback-${message.id}`}
            maxLength={280}
            value={feedbackComment}
            onChange={(event) => setFeedbackComment(event.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-900 p-2 text-sm text-white"
          />
          <div className="flex gap-2">
            <button type="submit" className="text-xs text-blue-300 hover:text-blue-200">
              Submit feedback
            </button>
            <button
              type="button"
              onClick={() => setShowFeedbackComment(false)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
