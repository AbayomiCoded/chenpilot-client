import { z } from 'zod';
import { VALIDATION_MESSAGES, PAYMENT_LIMITS, SECURITY_VALIDATION, TOKEN_DECIMALS } from '@/constants';
import { SUPPORTED_ASSETS, type BackendResponseValidationIssue } from '@/types';

// Email validation schema. Surrounding whitespace is accepted (and trimmed in the parsed
// value) so an accidental space doesn't block sign-in; see normalizeEmail (#259).
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

// Password validation schema
export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');

// Name validation schema
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be less than 50 characters');

// Stellar address validation schema
export const stellarAddressSchema = z
  .string()
  .min(1, VALIDATION_MESSAGES.ADDRESS_INVALID)
  .regex(SECURITY_VALIDATION.STELLAR_ADDRESS_REGEX, VALIDATION_MESSAGES.RECIPIENT_ADDRESS_INVALID);

// Keep for backward compatibility
export const starknetAddressSchema = stellarAddressSchema;

// Token amount validation schema
export const tokenAmountSchema = z
  .string()
  .min(1, VALIDATION_MESSAGES.AMOUNT_REQUIRED)
  .regex(SECURITY_VALIDATION.AMOUNT_REGEX, VALIDATION_MESSAGES.AMOUNT_INVALID_FORMAT)
  .refine((val) => parseFloat(val) > 0, VALIDATION_MESSAGES.AMOUNT_MUST_BE_POSITIVE);

export const getAssetPrecision = (tokenType?: string): number => {
  const normalizedType = (tokenType ?? 'XLM').toUpperCase();
  const precision = TOKEN_DECIMALS[normalizedType as keyof typeof TOKEN_DECIMALS];
  return typeof precision === 'number' ? precision : 7;
};

export const hasValidAssetPrecision = (amount: string, tokenType?: string): boolean => {
  if (!amount || Number.isNaN(Number(amount))) {
    return false;
  }

  const precision = getAssetPrecision(tokenType);
  const [, fractionalPart = ''] = amount.split('.');
  return fractionalPart.length <= precision;
};

// Contact validation schemas
export const createContactSchema = z.object({
  name: nameSchema,
  address: stellarAddressSchema,
  tokenType: z.enum(SUPPORTED_ASSETS, {
    error: `Unsupported token type. Supported tokens are: ${SUPPORTED_ASSETS.join(', ')}`,
  }),
  note: z.string().max(280, 'Contact notes are limited to 280 characters').optional(),
});

export const updateContactSchema = z.object({
  name: nameSchema.optional(),
  address: stellarAddressSchema.optional(),
  tokenType: z.enum(SUPPORTED_ASSETS, {
    error: `Unsupported token type. Supported tokens are: ${SUPPORTED_ASSETS.join(', ')}`,
  }).optional(),
  note: z.string().max(280, 'Contact notes are limited to 280 characters').optional(),
});

// Authentication schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
}).refine((data) => {
  // Additional validation to ensure all required fields are present
  return data.email && data.password && typeof data.email === 'string' && typeof data.password === 'string';
}, {
  message: "All required fields must be provided",
  path: ["email"]
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const nonEmptyStringSchema = z.string().min(1);
const balanceAmountSchema = z.string().regex(/^\d+(?:\.\d+)?$/, 'Expected a non-negative decimal amount');

export const userResponseSchema = z.object({
  id: nonEmptyStringSchema,
  email: z.string().email(),
  name: nonEmptyStringSchema,
  address: stellarAddressSchema,
  publicKey: stellarAddressSchema,
  isDeployed: z.boolean(),
  isFunded: z.boolean(),
  tokenType: z.literal('XLM'),
  authProvider: z.enum(['email', 'google']),
  isEmailVerified: z.boolean(),
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
}).passthrough();

const stellarAccountResponseSchema = z.object({
  address: stellarAddressSchema,
  publicKey: stellarAddressSchema,
  isDeployed: z.boolean(),
  deploymentTransactionHash: z.string().optional(),
}).passthrough();

const loginResponseDataSchema = z.object({
  user: userResponseSchema,
  token: nonEmptyStringSchema,
  stellarAccount: stellarAccountResponseSchema,
  starknetAccount: stellarAccountResponseSchema,
}).passthrough();

export const loginResponseSchema = z.object({
  success: z.literal(true),
  message: nonEmptyStringSchema,
  data: loginResponseDataSchema,
}).passthrough();

export const reauthenticationResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
}).passthrough();

export const refreshTokenResponseSchema = z.object({
  token: nonEmptyStringSchema,
}).passthrough();

export const registerResponseSchema = z.object({
  success: z.literal(true),
  message: nonEmptyStringSchema,
  data: loginResponseDataSchema.extend({
    setupStatus: z.object({
      funding: z.object({
        success: z.boolean(),
        error: z.string().optional(),
        amount: balanceAmountSchema,
        transactionHash: z.string().optional(),
      }).passthrough(),
      deployment: z.object({
        success: z.boolean(),
        transactionHash: z.string().optional(),
        contractAddress: z.string().optional(),
      }).passthrough(),
      fullyReady: z.boolean(),
    }).passthrough(),
  }),
}).passthrough();

const contactResponseSchema = z.object({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  address: stellarAddressSchema,
  tokenType: z.enum(['XLM', 'STRK', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA']),
  note: z.string().optional(),
  createdAt: nonEmptyStringSchema,
  updatedAt: nonEmptyStringSchema,
  avatar: z.string().optional(),
  isFavorite: z.boolean().optional(),
  lastUsed: z.string().optional(),
  defaultMemo: z.string().optional(),
  defaultMemoType: z.enum(['none', 'text', 'id', 'hash']).optional(),
}).passthrough();

export const contactsResponseSchema = apiResponseSchema(z.array(contactResponseSchema));
export const contactResponseEnvelopeSchema = apiResponseSchema(contactResponseSchema);
export const contactDeleteResponseSchema = apiResponseSchema(
  z.object({ message: nonEmptyStringSchema }).passthrough(),
);

export const balanceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    hasBalance: z.boolean(),
    balance: balanceAmountSchema,
    required: balanceAmountSchema,
    nativeBalance: balanceAmountSchema,
  }).passthrough(),
}).passthrough();

export const fundedAccountBalanceResponseSchema = apiResponseSchema(
  z.object({
    balance: balanceAmountSchema,
    hasBalance: z.boolean(),
  }).passthrough(),
);

const stellarOperationResponseSchema = z.object({
  id: nonEmptyStringSchema,
  type: nonEmptyStringSchema,
  amount: z.string().optional(),
  asset: z.string().optional(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
  asset_type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  source_account: nonEmptyStringSchema,
  direction: z.enum(['incoming', 'outgoing', 'self', 'unknown']).optional(),
}).passthrough();

export const stellarTransactionResponseSchema = z.object({
  id: nonEmptyStringSchema,
  hash: nonEmptyStringSchema,
  ledger: z.number().int().nonnegative(),
  created_at: nonEmptyStringSchema,
  source_account: nonEmptyStringSchema,
  fee_charged: balanceAmountSchema,
  operation_count: z.number().int().nonnegative(),
  successful: z.boolean(),
  operations: z.array(stellarOperationResponseSchema),
  memo: z.string().optional(),
  memo_type: z.enum(['text', 'id', 'hash', 'return']).optional(),
  direction: z.enum(['incoming', 'outgoing', 'self', 'unknown']).optional(),
}).passthrough();

export const transactionPageResponseSchema = apiResponseSchema(
  z.object({
    transactions: z.array(stellarTransactionResponseSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  }).passthrough(),
);

const horizonOperationResponseSchema = z.object({
  id: nonEmptyStringSchema,
  type: nonEmptyStringSchema,
  amount: z.string().optional(),
  asset_type: z.string().optional(),
  asset_code: z.string().optional(),
  asset_issuer: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  source_account: nonEmptyStringSchema,
}).passthrough();

const horizonTransactionRecordSchema = z.object({
  id: nonEmptyStringSchema,
  hash: nonEmptyStringSchema,
  ledger: z.number().int().nonnegative(),
  created_at: nonEmptyStringSchema,
  source_account: nonEmptyStringSchema,
  fee_charged: balanceAmountSchema,
  operation_count: z.number().int().nonnegative(),
  successful: z.boolean(),
  paging_token: z.string().optional(),
  memo: z.string().optional(),
  memo_type: z.enum(['text', 'id', 'hash', 'return']).optional(),
  _embedded: z.object({
    records: z.array(horizonOperationResponseSchema),
  }).passthrough(),
}).passthrough();

export const horizonTransactionPageResponseSchema = z.object({
  _embedded: z.object({
    records: z.array(horizonTransactionRecordSchema),
  }).passthrough(),
}).passthrough();

export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
      message: z.string().optional(),
    }).passthrough(),
    z.object({
      success: z.literal(false),
      status: z.number().int().nonnegative(),
      message: nonEmptyStringSchema,
    }).passthrough(),
  ]);
}

export class BackendResponseValidationError extends Error {
  constructor(
    readonly endpoint: string,
    readonly issues: BackendResponseValidationIssue[],
  ) {
    super(`Invalid backend response from ${endpoint}: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
    this.name = 'BackendResponseValidationError';
  }
}

export function parseBackendResponse<TSchema extends z.ZodType>(
  endpoint: string,
  schema: TSchema,
  payload: unknown,
): z.infer<TSchema> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new BackendResponseValidationError(
      endpoint,
      parsed.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join('.') : '<root>',
        message: issue.message,
      })),
    );
  }

  return parsed.data;
}

const MAX_STELLAR_MEMO_ID = "18446744073709551615";

function isWithinStellarMemoIdRange(value: string): boolean {
  const normalized = value.replace(/^0+(?=\d)/, "");
  return (
    normalized.length < MAX_STELLAR_MEMO_ID.length ||
    (normalized.length === MAX_STELLAR_MEMO_ID.length &&
      normalized <= MAX_STELLAR_MEMO_ID)
  );
}

// Agent query validation
export const agentQuerySchema = z.object({
  query: z.string().min(1, 'Please enter a message').max(1000, 'Message is too long'),
});

// Send Payment validation schema
export const sendPaymentSchema = z.object({
  recipientAddress: stellarAddressSchema,
  amount: z
    .string()
    .min(1, VALIDATION_MESSAGES.AMOUNT_REQUIRED)
    .regex(SECURITY_VALIDATION.AMOUNT_REGEX, VALIDATION_MESSAGES.AMOUNT_INVALID_FORMAT)
    .refine((val) => parseFloat(val) > 0, VALIDATION_MESSAGES.AMOUNT_MUST_BE_POSITIVE)
    .refine((val) => parseFloat(val) >= PAYMENT_LIMITS.MIN_AMOUNT, VALIDATION_MESSAGES.AMOUNT_EXCEEDS_MIN)
    .refine((val) => parseFloat(val) <= PAYMENT_LIMITS.MAX_AMOUNT, VALIDATION_MESSAGES.AMOUNT_EXCEEDS_MAX),
  tokenType: z.enum(PAYMENT_LIMITS.SUPPORTED_TOKENS, {
    error: VALIDATION_MESSAGES.TOKEN_TYPE_REQUIRED,
  }),
  memo: z.string().optional(),
  memoType: z.enum(PAYMENT_LIMITS.MEMO_TYPES).optional(),
  recipientContactId: z.string().optional(),
}).superRefine((data, context) => {
  const precision = getAssetPrecision(data.tokenType);
  const decimalPart = data.amount.split('.')[1] ?? '';

  if (decimalPart.length > precision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Amount exceeds ${precision} decimal places for ${data.tokenType}.`,
      path: ['amount'],
    });
  }

  if (data.memo && data.memo.length > 0 && !data.memoType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: VALIDATION_MESSAGES.MEMO_TYPE_REQUIRED,
      path: ['memoType'],
    });
    return;
  }

  if (data.memo && data.memoType === 'id') {
    if (
      !SECURITY_VALIDATION.MEMO_ID_REGEX.test(data.memo) ||
      !isWithinStellarMemoIdRange(data.memo)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: VALIDATION_MESSAGES.MEMO_TYPE_REQUIRED,
        path: ['memoType'],
      });
      return;
    }
  }

  if (
    data.memo &&
    data.memoType === 'text' &&
    new TextEncoder().encode(data.memo).length > PAYMENT_LIMITS.MAX_MEMO_LENGTH
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Text memo must be at most ${PAYMENT_LIMITS.MAX_MEMO_LENGTH} UTF-8 bytes.`,
      path: ['memo'],
    });
  }

  if (data.memo && data.memoType === 'hash') {
    if (!SECURITY_VALIDATION.MEMO_HASH_REGEX.test(data.memo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: VALIDATION_MESSAGES.MEMO_HASH_INVALID,
        path: ['memo'],
      });
    }
  }
});

// Normalize a contact address: trim whitespace and uppercase
export const normalizeContactAddress = (address: string): string =>
  address.trim().toUpperCase();

// Validate contact address after normalization; returns error string or null
export const validateContactAddress = (raw: string): string | null => {
  const normalized = normalizeContactAddress(raw);
  const result = stellarAddressSchema.safeParse(normalized);
  if (!result.success) {
    const issues = result.error.issues;
    return issues[0]?.message ?? 'Invalid Stellar address';
  }
  return null;
};

// Full contact create/update validation utilities
export const validateContact = (
  data: { name: string; address: string; tokenType: string }
): { isValid: boolean; errors: Record<string, string> } => {
  const normalized = { ...data, address: normalizeContactAddress(data.address) };
  const result = createContactSchema.safeParse(normalized);
  if (result.success) return { isValid: true, errors: {} };
  const issues = result.error.issues;
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0] as string;
    if (!errors[key]) errors[key] = issue.message;
  }
  return { isValid: false, errors };
};

export const validateUpdateContact = (
  data: { name?: string; address?: string; tokenType?: string }
): { isValid: boolean; errors: Record<string, string> } => {
  const normalized = data.address
    ? { ...data, address: normalizeContactAddress(data.address) }
    : data;
  const result = updateContactSchema.safeParse(normalized);
  if (result.success) return { isValid: true, errors: {} };
  const issues = result.error.issues;
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0] as string;
    if (!errors[key]) errors[key] = issue.message;
  }
  return { isValid: false, errors };
};

// Utility functions for validation
export const validateEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

export const validatePassword = (password: string): boolean => {
  try {
    passwordSchema.parse(password);
    return true;
  } catch {
    return false;
  }
};

export const validateStellarAddress = (address: string): boolean => {
  try {
    stellarAddressSchema.parse(address);
    return true;
  } catch {
    return false;
  }
};

// Keep for backward compatibility
export const validateStarknetAddress = validateStellarAddress;

export const validateTokenAmount = (amount: string): boolean => {
  try {
    tokenAmountSchema.parse(amount);
    return true;
  } catch {
    return false;
  }
};

// Send payment validation utility functions
export const validateSendPayment = (data: {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
}): { isValid: boolean; errors: string[] } => {
  try {
    sendPaymentSchema.parse(data);
    return { isValid: true, errors: [] };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);
      return { isValid: false, errors };
    }
    return { isValid: false, errors: ['Validation failed'] };
  }
};

export const getPaymentFailureMessage = (error: unknown): string => {
  let message = error instanceof Error ? error.message : String(error || '');

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      message = response.data.message;
    }
  }

  const normalizedMessage = message.toLowerCase();

  if (/account.*not.*exist|destination.*not.*activated|destination.*not.*exist|not.*activated|activate.*account|account.*does not exist/i.test(message)) {
    return 'This Stellar destination is not activated yet. The recipient must activate the account and hold the required minimum balance before this payment can succeed.';
  }

  if (/reserve|minimum\s+(native\s+)?balance|insufficient\s+native\s+balance|insufficient.*funds|not enough.*balance/i.test(normalizedMessage)) {
    return "This payment would leave too little XLM to meet Stellar's minimum account reserve. Reduce the amount or add XLM.";
  }

  if (/not enough.*balance|amount.*exceeds.*balance/i.test(normalizedMessage)) {
    return 'The requested amount exceeds the available balance for this asset.';
  }

  return message || 'Failed to send payment';
};

export const validateMemo = (memo: string, memoType: string): boolean => {
  if (memoType === 'none') return true;
  if (!memo || memo.trim().length === 0) return false;
  
  if (memoType === 'id') {
    return SECURITY_VALIDATION.MEMO_ID_REGEX.test(memo) && isWithinStellarMemoIdRange(memo);
  }
  if (memoType === 'hash') {
    return SECURITY_VALIDATION.MEMO_HASH_REGEX.test(memo);
  }
  if (memoType === 'text') {
    return new TextEncoder().encode(memo).length <= PAYMENT_LIMITS.MAX_MEMO_LENGTH;
  }
  return false;
};

export const validateAmountRange = (
  amount: string,
  min: number = PAYMENT_LIMITS.MIN_AMOUNT,
  max: number = PAYMENT_LIMITS.MAX_AMOUNT
): boolean => {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) return false;
  return numAmount >= min && numAmount <= max;
};

export const sanitizePaymentInput = (data: {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
}): {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
} => {
  return {
    recipientAddress: data.recipientAddress.trim(),
    amount: data.amount.trim(),
    tokenType: data.tokenType.toUpperCase(),
    ...(data.memoType?.toLowerCase() === 'none'
      ? {}
      : data.memo?.trim()
        ? { memo: data.memo.trim() }
        : {}),
    memoType: data.memoType?.toLowerCase(),
    recipientContactId: data.recipientContactId?.trim(),
    idempotencyKey: data.idempotencyKey?.trim() || undefined,
  };
};
