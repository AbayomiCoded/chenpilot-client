
import type React from "react";

// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  address: string;
  publicKey: string;
  isDeployed: boolean;
  isFunded: boolean;
  tokenType: "XLM";
  authProvider: "email" | "google";
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Server event model for sign-in activity (#257). See docs/API_CONTRACT.md "Sign-in Activity". */
export interface SignInActivityEvent {
  id: string;
  type: "sign_in" | "sign_out" | "password_change" | "reauthentication" | "token_refresh";
  outcome: "success" | "failure";
  /** ISO 8601 timestamp. */
  occurredAt: string;
  /** Coarse device info derived server-side; never a full fingerprint. */
  device?: { browser?: string; os?: string; type?: "desktop" | "mobile" | "tablet" | "unknown" };
  /** Raw user agent, used only when `device` is missing. */
  userAgent?: string;
  /** Approximate location (country/region), if the server provides it. */
  approxLocation?: { country?: string; region?: string };
  /** IP address. Hidden in the UI unless the user asks for details. */
  ipAddress?: string;
  method?: "password" | "google";
  /** Session this event belongs to, for revocation. */
  sessionId?: string;
  /** The session making this request. */
  current?: boolean;
}

export interface SignInActivityPage {
  events: SignInActivityEvent[];
  /** What the backend supports; actions are hidden when false/absent. */
  capabilities: { revokeSession: boolean; reportEvent: boolean };
}

export interface StellarAccountInfo {
  address: string;
  publicKey: string;
  isDeployed: boolean;
  deploymentTransactionHash?: string;
}

// Keep for backward compatibility
export type StarknetAccountInfo = StellarAccountInfo;

export interface AccountStatus {
  isDeployed: boolean;
  isFunded: boolean;
  deploymentTransactionHash?: string;
  fundingTransactionHash?: string;
  balance: string;
  address: string;
  publicKey: string;
}

// Authentication Request/Response Types
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    stellarAccount: StellarAccountInfo;
    starknetAccount: StellarAccountInfo;
    setupStatus: {
      funding: {
        success: boolean;
        error?: string;
        amount: string;
        transactionHash?: string;
      };
      deployment: {
        success: boolean;
        transactionHash?: string;
        contractAddress?: string;
      };
      fullyReady: boolean;
    };
  };
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    stellarAccount: StellarAccountInfo;
    starknetAccount: StellarAccountInfo;
  };
}

// Multi-Factor Authentication (MFA) Types
export interface MfaStatusData {
  enabled: boolean;
  enrolledAt?: string;
  method?: "totp" | null;
}

export interface MfaEnrollmentData {
  secret: string;
  qrCodeUrl?: string;
  otpAuthUri?: string;
  recoveryCodes?: string[];
}

export interface MfaVerifyRequest {
  code: string;
}

export interface MfaVerifyData {
  enabled: boolean;
  message?: string;
  recoveryCodes?: string[];
}

// Contact Management Types

/** Memo types supported by Stellar. 'none' means no memo is attached. */
export type ContactMemoType = "none" | "text" | "id" | "hash";

export interface Contact {
  id: string;
  name: string;
  address: string;
  tokenType: TokenType | "STRK";
  note?: string;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
  isFavorite?: boolean;
  lastUsed?: string;
  /** Optional default memo value pre-filled when this contact is selected as recipient. */
  defaultMemo?: string;
  /** Memo type that accompanies defaultMemo. Ignored when defaultMemo is absent. */
  defaultMemoType?: ContactMemoType;
}

export interface CreateContactRequest {
  name: string;
  address: string;
  tokenType: TokenType;
  defaultMemo?: string;
  defaultMemoType?: ContactMemoType;
  note?: string;
}

export interface UpdateContactRequest {
  name?: string;
  address?: string;
  tokenType?: TokenType;
  defaultMemo?: string;
  defaultMemoType?: ContactMemoType;
}

/**
 * Portable export format for a user's contact list.
 * Only user-owned, non-sensitive fields are included.
 * Third-party services are never involved in generating this file.
 */
export interface ContactExportRecord {
  name: string;
  address: string;
  tokenType: string;
  defaultMemo?: string;
  defaultMemoType?: ContactMemoType;
  isFavorite?: boolean;
  createdAt: string;
}

export interface ContactExportEnvelope {
  /** Format identifier for future import support. */
  format: "chenpilot-contacts-v1";
  exportedAt: string;
  contacts: ContactExportRecord[];
}

// Balance and Wallet Types
export interface BalanceResponse {
  success: boolean;
  data: {
    hasBalance: boolean;
    balance: string;
    required: string;
    nativeBalance: string;
  };
}

export interface WalletBalance {
  hasBalance: boolean;
  balance: string;
  required: string;
  nativeBalance: string;
}

// Stellar Trustline Types
export interface Trustline {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  limit: string;
  buyingLiabilities?: string;
  sellingLiabilities?: string;
  assetType?: string;
}

export interface AddTrustlineRequest {
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

export interface RemoveTrustlineRequest {
  assetCode: string;
  assetIssuer: string;
}

// Stellar Transaction Types
export type TransactionDirection =
  | "incoming"
  | "outgoing"
  | "self"
  | "unknown";

/**
 * Operation types the transaction UI has a curated label for.
 * Horizon may return additional operation types, so StellarOperation.type
 * remains a plain string.
 */
export type StellarOperationType =
  | "payment"
  | "create_account"
  | "account_merge"
  | "manage_offer"
  | "create_passive_offer"
  | "set_options"
  | "change_trust"
  | "allow_trust"
  | "account_created"
  | "invoke_host_function"
  | "bump_sequence"
  | "ext_soroban_op";

/**
 * Identifies a Stellar asset and its canonical representation.
 */
export interface AssetIdentifier {
  code: string;
  issuer?: string;
  isNative: boolean;
  canonical: string;
  hasIncompleteMetadata?: boolean;
}

export interface StellarOperation {
  id: string;
  /** Raw Horizon operation type. */
  type: string;
  amount?: string;
  asset?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset_type?: string;
  from?: string;
  to?: string;
  source_account: string;
  direction?: TransactionDirection;
}

export interface StellarTransaction {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  fee_charged: string;
  operation_count: number;
  successful: boolean;
  operations: StellarOperation[];
  /**
   * Memo value attached to the transaction, as returned by Horizon.
   * Present only when the transaction carried a memo.
   */
  memo?: string;
  /**
   * Stellar memo type: 'text', 'id', 'hash', or 'return'.
   * Absent when no memo was attached.
   */
  memo_type?: "text" | "id" | "hash" | "return";
  direction?: TransactionDirection;
  memo?: string;
}

/**
 * Lifecycle of a wallet action.
 */
export type TransactionLifecycleStatus =
  | "pending"
  | "confirmed"
  | "failed";

export interface PendingTransactionConfirmation {
  /** Normalized transaction hash used for reconciliation. */
  hash: string;
  /** Human-readable description of the wallet action. */
  label: string;
  status: TransactionLifecycleStatus;
  /** ISO timestamp of the last status change. */
  updatedAt: string;
}

export interface TransactionHistory {
  transactions: StellarTransaction[];
  isLoading: boolean;
  error: string | null;
  isRefreshing: boolean;
  refreshError: string | null;
  lastUpdatedAt: string | null;
  nextCursor: string | null;
  isLoadingMore: boolean;
  loadMoreError: string | null;
  pending: PendingTransactionConfirmation[];
}

/**
 * Client-side search state for the transaction history page.
 * Filtering is performed in-memory; no additional API calls are required.
 */
export interface TransactionSearchState {
  /** Raw value from the search input */
  query: string;
  /** Transactions that survive the current query and any active filters */
  filtered: StellarTransaction[];
}

// Agent Query Types
export interface AgentQueryRequest {
  userId: string;
  query: string;
}

export interface AgentQueryResponse {
  result: {
    success: boolean;
    data: string;
    error?: string;
    executionTrace?: ExecutionTrace;
  };
}

// Execution Trace Types
export interface ExecutionTrace {
  steps: ExecutionStep[];
  totalTime: number;
  startTime: string;
  endTime: string;
}

export interface ExecutionStep {
  id: string;
  name: string;
  type: "thought" | "action" | "tool_call" | "result" | "error";
  timestamp: string;
  duration: number;
  description: string;
  details?: Record<string, unknown>;
  substeps?: ExecutionStep[];
}

// Chat and Message Types

/** Discriminates between plain text and voice messages. */
export type MessageType = "text" | "voice";
export type FeedbackRating = "up" | "down";

export interface MessageFeedback {
  rating: FeedbackRating;
  comment?: string;
  submittedAt: string;
}

/** Identifies who sent a chat message. */
export type ChatMessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;
  type: ChatMessageRole;
  messageType?: MessageType;
  content: string;
  timestamp: string;
  serverTimestamp?: number | string;
  parentId?: string;
  threadId?: string;
  replyCount?: number;
  voice?: {
    audioUrl: string;
    duration: number;
    mimeType: string;
    transcript: string;
    sizeBytes: number;
  };
  metadata?: {
    transactionHash?: string;
    amount?: string;
    tokenType?: string;
    status?: "pending" | "success" | "failed" | "cancelled";
    success?: boolean;
    error?: string;
    type?: string;
    action?: string;
    asset?: string;
    requiresConfirmation?: boolean;
    executionTrace?: ExecutionTrace;
    feedback?: MessageFeedback;
    rawData?: Record<string, unknown>;
    serverTimestamp?: number | string;
    clientTimestamp?: number | string;
    optimisticId?: string;
    tempId?: string;
    /** Delivery state of a user message (#266); see src/store/messageDelivery.ts. */
    delivery?: "queued" | "sending" | "sent" | "failed";
    /** Server-assigned id once the message was acknowledged (#266). */
    serverId?: string;
    /** Failure category of an agent reply (#274, #262), e.g. `timeout` vs `network`. */
    errorKind?: "timeout" | "network" | "server" | "invalid_query" | "unauthenticated" | "unknown";
    /** Client request id / idempotency key of the query this reply belongs to (#274, #262). */
    requestId?: string;
    /** Whether a retry action is offered for this failed reply (#262). */
    retryable?: boolean;
    /** Original prompt, preserved so a retry resends exactly what the user typed (#262). */
    retryPrompt?: string;
    /** Optimistic id of the original user message, reused on retry so no duplicate bubble appears. */
    retryTempId?: string;
    /** The prompt looked like a state-changing action (transfer, swap, ...); retries check status first. */
    stateChanging?: boolean;
    /** Outcome of the latest status check after a timeout (#274). */
    actionStatus?: "pending" | "completed" | "failed" | "unknown";
  };
}

/** Represents an open thread panel for a root message. */
export interface ThreadState {
  rootMessageId: string;
  replies: ChatMessage[];
  isTyping: boolean;
}

/** One page of server-side chat history (#265, #264). */
export interface ChatHistoryPage {
  /** Messages in this page; any order, deduped and sorted client-side. */
  messages: ChatMessage[];
  /** Opaque cursor for the next older page; `null` when there is none. */
  nextCursor: string | null;
  /** Whether older messages exist beyond this page. */
  hasMore: boolean;
}

/** Query for one history page (#264). Omit `before` for the newest page. */
export interface ChatHistoryQuery {
  before?: string;
  limit?: number;
}

/** Load state for the chat history screen (#265). */
export type ChatHistoryStatus = "idle" | "loading" | "succeeded" | "failed";

export interface Conversation {
  id: string;
  title: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
  messageCount: number;
  messages?: ChatMessage[];
  tags?: string[];
  pinned?: boolean;
  pinnedAt?: string;
}

export interface ConversationTag {
  id: string;
  name: string;
  color?: string;
  userId: string;
}

export interface PromptVersionRecord {
  [key: string]: unknown;
}

export interface PromptVersion {
  id: string;
  label: string;
  description: string;
  template: string;
  version: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  raw: PromptVersionRecord;
}

// API Response Types
export interface ApiError {
  success: false;
  status: number;
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// UI State Types
export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
  timestamp: string;
}

export interface Theme {
  mode: "light" | "dark";
}

// Form Types
export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  validation?: {
    required?: boolean;
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  options?: { value: string; label: string }[];
}

// Navigation Types
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
  children?: NavItem[];
}

// Environment Configuration
export interface Environment {
  API_BASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  APP_NAME: string;
  APP_VERSION: string;
  NODE_ENV: "development" | "production" | "test";
}

// Redux State Types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface TransactionFilters {
  type: string;
  asset: string;
  direction: string;
  startDate: string;
  endDate: string;
}

export interface AccountState {
  status: AccountStatus | null;
  balance: WalletBalance | null;
  transactions: TransactionHistory;
  filters?: TransactionFilters;
  isLoading: boolean;
  error: string | null;
  network: {
    status: "healthy" | "degraded" | "down" | "unknown";
    latestLedger: number | null;
    ledgerCloseTimeMs: number | null;
    ledgerAgeSeconds: number | null;
    congestion: boolean;
    accountSyncState: "synced" | "syncing" | "desynced";
    lastUpdated: string | null;
    isLoading: boolean;
    error: string | null;
  };
  trustlines: Trustline[];
  isLoadingTrustlines: boolean;
  trustlinesError: string | null;
}

export interface ContactsState {
  list: Contact[];
  isLoading: boolean;
  error: string | null;
  selectedContact: Contact | null;
  /** Tracks which mutation is in-flight to prevent duplicate actions. */
  mutating: {
    create: boolean;
    /** IDs of contacts currently being updated. */
    update: string[];
    /** IDs of contacts currently being deleted. */
    delete: string[];
  };
  /** Per-mutation error messages keyed by operation type or contact id. */
  mutationError: {
    create: string | null;
    update: Record<string, string>;
    delete: Record<string, string>;
  };
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
}

export interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  notifications: Notification[];
  modals: {
    [key: string]: boolean;
  };
}

export interface PresenceState {
  users: {
    [userId: string]: {
      userId: string;
      userName: string;
      status: "online" | "away" | "offline";
      lastSeen: string;
      conversationId?: string;
    };
  };
  onlineCount: number;
  awayCount: number;
  offlineCount?: number;
}

export interface RootState {
  auth: AuthState;
  account: AccountState;
  contacts: ContactsState;
  chat: ChatState;
  ui: UIState;
  presence: PresenceState;
}

// Component Props Types
export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

// Utility Types

/**
 * Canonical list of tokens supported by both the payment and contact systems.
 * This is the single source of truth; add tokens here and they propagate
 * everywhere automatically.  The value order controls the dropdown order.
 */
export const SUPPORTED_ASSETS = ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'] as const;

/** Union type derived from SUPPORTED_ASSETS — do not list values separately. */
export type TokenType = typeof SUPPORTED_ASSETS[number];

export type AuthProvider = "email" | "google";
export type NotificationType = "success" | "error" | "warning" | "info";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ModalSize = "sm" | "md" | "lg" | "xl";

// Liquidity Pool Types
export interface LiquidityPool {
  id: string;
  name: string;
  token1: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  };
  token2: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  };
  reserve1: string;
  reserve2: string;
  totalLiquidity: string;
  apr: number;
  volume24h: string;
  fee: number;
  isActive: boolean;
  created_at: string;
}

export interface LiquidityStats {
  totalPools: number;
  totalLiquidity: string;
  totalVolume24h: string;
  averageAPR: number;
  activePools: number;
  topPools: LiquidityPool[];
  networkMetrics: {
    gasPrice: string;
    blockNumber: number;
    timestamp: string;
  };
}

export interface LiquidityRequest {
  includeInactive?: boolean;
  limit?: number;
  sortBy?: "liquidity" | "volume" | "apr";
  sortOrder?: "asc" | "desc";
}

// Audit Log Types
export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.register"
  | "user.update_profile"
  | "user.delete_account"
  | "user.password_change"
  | "user.email_verify"
  | "user.token_refresh"
  | "transaction.create"
  | "transaction.send"
  | "transaction.receive"
  | "transaction.swap"
  | "contact.create"
  | "contact.update"
  | "contact.delete"
  | "agent.query"
  | "agent.tool_execute"
  | "auth.google_auth"
  | "admin.access"
  | "admin.audit_view"
  | "settings.update"
  | "account.deploy"
  | "account.fund"
  | "liquidity.query";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  description: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity: AuditSeverity;
  status: "success" | "failure" | "pending";
  duration?: number;
  timestamp: string;
  createdAt: string;
}

export interface AuditLogsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  status?: "success" | "failure" | "pending";
  startDate?: string;
  endDate?: string;
  sortBy?: "timestamp" | "action" | "userEmail" | "severity";
  sortOrder?: "asc" | "desc";
}

export interface AuditLogsResponse {
  success: boolean;
  data: {
    logs: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message?: string;
}

export interface AuditLogStats {
  totalLogs: number;
  uniqueUsers: number;
  actionsByType: Record<string, number>;
  errorsToday: number;
  warningsToday: number;
  recentActivity: AuditLogEntry[];
}

// Send Payment Types
export interface SendPaymentRequest {
  recipientAddress: string;
  amount: string;
  tokenType: TokenType;
  memo?: string;
  memoType?: "none" | "text" | "id" | "hash";
  recipientContactId?: string;
  idempotencyKey?: string;
}

export interface PaymentSubmissionResult {
  status: "pending" | "submitted" | "confirmed" | "failed";
  transactionHash?: string;
  transactionId?: string;
  message?: string;
}

export interface PaymentStatusResult
  extends Omit<PaymentSubmissionResult, "status"> {
  status: PaymentSubmissionResult["status"] | "not_found";
}

export interface SendPaymentValidationResult {
  isValid: boolean;
  errors: string[];
  data?: SendPaymentRequest;
}

// Contact Selection Types
export interface ContactSelection {
  id: string;
  name: string;
  address: string;
  tokenType: TokenType;
  note?: string;
  avatar?: string;
  isFavorite?: boolean;
  lastUsed?: string;
  /** Carries the contact's default memo preset so the payment form can prefill it. */
  defaultMemo?: string;
  defaultMemoType?: ContactMemoType;
}

export interface ContactPickerState {
  isOpen: boolean;
  selectedContact: ContactSelection | null;
  searchTerm: string;
  filteredContacts: ContactSelection[];
}

export interface ContactPickerProps {
  contacts: Contact[];
  onSelect: (contact: ContactSelection) => void;
  onClose: () => void;
  isOpen: boolean;
  isLoading?: boolean;
  tokenType?: TokenType;
}

export interface PaymentLimits {
  minAmount: number;
  maxAmount: number;
  maxMemoLength: number;
  supportedTokens: readonly TokenType[];
}

export interface PaymentFeeEstimate {
  baseFee: string;
  estimatedTotal: string;
  tokenType: string;
}

// Account Deployment Types
export type DeploymentStep =
  | "auth"
  | "funding"
  | "deployment"
  | "verification"
  | "complete";

export type DeploymentStepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed";

export interface DeploymentStepInfo {
  id: DeploymentStep;
  title: string;
  description: string;
  status: DeploymentStepStatus;
  timestamp?: string;
  transactionHash?: string;
  error?: string;
}

export interface DeploymentProgress {
  currentStep: DeploymentStep;
  steps: DeploymentStepInfo[];
  isComplete: boolean;
  hasError: boolean;
  startTime?: string;
  endTime?: string;
}

export interface DeploymentConfig {
  network: "testnet" | "mainnet";
  fundingAmount: string;
  autoDeploy: boolean;
}
