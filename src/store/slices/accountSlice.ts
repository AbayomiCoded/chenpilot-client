import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import {
  AccountStatus,
  WalletBalance,
  StellarTransaction,
  AccountState,
  Trustline,
  AddTrustlineRequest,
  TransactionFilters,
} from "@/types";
import { horizonFetch } from "@/utils/horizonFetch";
import apiService from "@/services/api";

export type { TransactionFilters };

export const initialFilters: TransactionFilters = {
  type: "all",
  asset: "all",
  direction: "all",
  startDate: "",
  endDate: "",
};

type NetworkHealthStatus = "healthy" | "degraded" | "down" | "unknown";
type AccountSyncState = "synced" | "syncing" | "desynced";

const initialState: AccountState = {
  status: null,
  balance: null,
  transactions: {
    transactions: [],
    isLoading: false,
    error: null,
  },
  filters: initialFilters,
  isLoading: false,
  error: null,
  network: {
    status: "unknown",
    latestLedger: null,
    ledgerCloseTimeMs: null,
    ledgerAgeSeconds: null,
    congestion: false,
    accountSyncState: "syncing",
    lastUpdated: null,
    isLoading: false,
    error: null,
  },
  trustlines: [],
  isLoadingTrustlines: false,
  trustlinesError: null,
};

// Async thunks
export const getAccountStatus = createAsyncThunk(
  "account/getStatus",
  async () => {
    // Mock account status
    const mockStatus: AccountStatus = {
      isDeployed: true,
      isFunded: true,
      deploymentTransactionHash: "0xmockdeploymenthash",
      fundingTransactionHash: "0xmockfundinghash",
      balance: "1000000000000000000", // 1 ETH in wei
      address: "0x1234567890abcdef",
      publicKey: "0xabcdef1234567890",
    };
    return mockStatus;
  },
);

export const getBalance = createAsyncThunk(
  "account/getBalance",
  async () => {
    // Mock balance
    return "1000000000000000000"; // 1 ETH in wei
  },
);

export const getStellarNetworkStatus = createAsyncThunk(
  "account/getStellarNetworkStatus",
  async (_, { rejectWithValue }) => {
    try {
      const response = await horizonFetch(
        "https://horizon.stellar.org/ledgers?order=desc&limit=1",
      );
      if (!response.ok) {
        return rejectWithValue("Failed to fetch Stellar network status");
      }
      const data = await response.json();
      const latestLedgerRecord = data?._embedded?.records?.[0];
      if (!latestLedgerRecord) {
        return rejectWithValue("No ledger data available");
      }

      const latestLedger = Number(latestLedgerRecord.sequence);
      const closedAt = latestLedgerRecord.closed_at
        ? new Date(latestLedgerRecord.closed_at).getTime()
        : null;
      const ledgerAgeSeconds = closedAt
        ? Math.max(0, Math.floor((Date.now() - closedAt) / 1000))
        : null;
      const maxTxSetSize = latestLedgerRecord.max_tx_set_size
        ? Number(latestLedgerRecord.max_tx_set_size)
        : 0;
      const successfulTxCount = latestLedgerRecord.successful_transaction_count
        ? Number(latestLedgerRecord.successful_transaction_count)
        : 0;
      const congestion =
        maxTxSetSize > 0 ? successfulTxCount / maxTxSetSize >= 0.85 : false;

      return {
        latestLedger,
        ledgerCloseTimeMs: closedAt,
        ledgerAgeSeconds,
        congestion,
        lastUpdated: new Date().toISOString(),
      };
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message || "Failed to fetch Stellar network status",
      );
    }
  },
);

export const deployAccount = createAsyncThunk(
  "account/deploy",
  async () => {
    // Mock deploy account - always succeed
    return { success: true, transactionHash: "0xmockdeployhash" };
  },
);

export const fundAccount = createAsyncThunk(
  "account/fund",
  async () => {
    // Mock fund account - always succeed
    return { success: true, transactionHash: "0xmockfundhash" };
  },
);

export const getAutoFundingStats = createAsyncThunk(
  "account/getAutoFundingStats",
  async () => {
    // Mock funding stats
    return {
      totalFunded: 10,
      totalAmount: "10000000000000000000", // 10 ETH
      lastFunding: new Date().toISOString(),
    };
  },
);

export const getTransactionHistory = createAsyncThunk(
  "account/getTransactionHistory",
  async (publicKey: string, { rejectWithValue }) => {
    try {
      const response = await horizonFetch(
        `https://horizon.stellar.org/accounts/${publicKey}/transactions?order=desc&limit=50`,
      );
      if (!response.ok) {
        return rejectWithValue("Failed to fetch transaction history");
      }
      const data = await response.json();
      const transactions: StellarTransaction[] = data._embedded.records.map(
        (record: Record<string, unknown>) => ({
          id: record.id,
          hash: record.hash,
          ledger: record.ledger,
          created_at: record.created_at,
          source_account: record.source_account,
          fee_charged: record.fee_charged,
          operation_count: record.operation_count,
          successful: record.successful,
          operations:
            (record._embedded as { records?: Record<string, unknown>[] })?.records?.map((op: Record<string, unknown>) => ({
              id: op.id,
              type: op.type,
              amount: op.amount,
              asset:
                op.asset_type === "native"
                  ? "XLM"
                  : `${op.asset_code}:${op.asset_issuer}`,
              from: op.from,
              to: op.to,
              source_account: op.source_account,
            })) || [],
        }),
      );
      return transactions;
    } catch (error: unknown) {
      return rejectWithValue(
        (error as { message?: string }).message || "Failed to fetch transaction history",
      );
    }
  },
);

export const getAccountTransactions = createAsyncThunk(
  "account/getAccountTransactions",
  async (
    { userId, page = 1, limit = 10 }: { userId: string; page?: number; limit?: number },
    { rejectWithValue }
  ) => {
    try {
      const response = await apiService.getAccountTransactions(userId, page, limit);
      if (!response.success) {
        return rejectWithValue(response.message || "Failed to fetch transactions");
      }
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.message || "Failed to fetch account transactions",
      );
    }
  },
);


// Trustline Async Thunks
export const fetchTrustlines = createAsyncThunk(
  "account/fetchTrustlines",
  async (publicKey: string, { rejectWithValue }) => {
    try {
      const trustlines = await apiService.fetchAccountTrustlines(publicKey);
      return trustlines;
    } catch (error: any) {
      return rejectWithValue(
        error.message || "Failed to fetch account trustlines",
      );
    }
  },
);

export const addAccountTrustline = createAsyncThunk(
  "account/addTrustline",
  async (
    { publicKey, data }: { publicKey: string; data: AddTrustlineRequest },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const result = await apiService.addTrustline(publicKey, data);
      await dispatch(fetchTrustlines(publicKey));
      return result;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to add trustline");
    }
  },
);

export const removeAccountTrustline = createAsyncThunk(
  "account/removeTrustline",
  async (
    {
      publicKey,
      assetCode,
      assetIssuer,
    }: { publicKey: string; assetCode: string; assetIssuer: string },
    { dispatch, rejectWithValue },
  ) => {
    try {
      const result = await apiService.removeTrustline(
        publicKey,
        assetCode,
        assetIssuer,
      );
      await dispatch(fetchTrustlines(publicKey));
      return result;
    } catch (error: any) {
      return rejectWithValue(error.message || "Failed to remove trustline");
    }
  },
);

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateAccountStatus: (
      state,
      action: PayloadAction<Partial<AccountStatus>>,
    ) => {
      if (state.status) {
        state.status = { ...state.status, ...action.payload };
      } else {
        state.status = action.payload as AccountStatus;
      }
    },
    updateBalance: (state, action: PayloadAction<Partial<WalletBalance>>) => {
      if (state.balance) {
        state.balance = { ...state.balance, ...action.payload };
      } else {
        state.balance = action.payload as WalletBalance;
      }
    },
    clearAccount: (state) => {
      state.status = null;
      state.balance = null;
      state.error = null;
      state.trustlines = [];
      state.trustlinesError = null;
    },
    setTrustlines: (state, action: PayloadAction<Trustline[]>) => {
      state.trustlines = action.payload;
    },
    setLoadingTrustlines: (state, action: PayloadAction<boolean>) => {
      state.isLoadingTrustlines = action.payload;
    },
    setTrustlinesError: (state, action: PayloadAction<string | null>) => {
      state.trustlinesError = action.payload;
    },
    setTransactionFilter: (
      state,
      action: PayloadAction<Partial<TransactionFilters>>,
    ) => {
      state.filters = { ...(state.filters || initialFilters), ...action.payload };
    },
    clearTransactionFilters: (state) => {
      state.filters = initialFilters;
    },
  },
  extraReducers: (builder) => {
    builder
      // Get Account Status
      .addCase(getAccountStatus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getAccountStatus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.status = action.payload;
        state.error = null;
      })
      .addCase(getAccountStatus.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Get Balance
      .addCase(getBalance.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getBalance.fulfilled, (state, action) => {
        state.isLoading = false;
        state.balance = action.payload;
        state.error = null;
      })
      .addCase(getBalance.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Get Stellar Network Status
      .addCase(getStellarNetworkStatus.pending, (state) => {
        state.network.isLoading = true;
        state.network.error = null;
        state.network.accountSyncState = "syncing";
      })
      .addCase(getStellarNetworkStatus.fulfilled, (state, action) => {
        const {
          latestLedger,
          ledgerCloseTimeMs,
          ledgerAgeSeconds,
          congestion,
          lastUpdated,
        } = action.payload;
        let status: NetworkHealthStatus = "healthy";
        if (ledgerAgeSeconds !== null && ledgerAgeSeconds > 30) {
          status = "down";
        } else if (ledgerAgeSeconds !== null && ledgerAgeSeconds > 15) {
          status = "degraded";
        } else if (congestion) {
          status = "degraded";
        }

        const accountSyncState: AccountSyncState =
          ledgerAgeSeconds === null
            ? "desynced"
            : ledgerAgeSeconds > 30
              ? "desynced"
              : ledgerAgeSeconds > 15
                ? "syncing"
                : "synced";

        state.network = {
          ...state.network,
          status,
          latestLedger,
          ledgerCloseTimeMs,
          ledgerAgeSeconds,
          congestion,
          lastUpdated,
          accountSyncState,
          isLoading: false,
          error: null,
        };
      })
      .addCase(getStellarNetworkStatus.rejected, (state, action) => {
        state.network.isLoading = false;
        state.network.status = "down";
        state.network.error = action.payload as string;
        state.network.accountSyncState = "desynced";
      })
      // Deploy Account
      .addCase(deployAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(deployAccount.fulfilled, (state, action) => {
        state.isLoading = false;
        if (state.status) {
          state.status.isDeployed = true;
          state.status.deploymentTransactionHash =
            action.payload.transactionHash;
        }
        state.error = null;
      })
      .addCase(deployAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Fund Account
      .addCase(fundAccount.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fundAccount.fulfilled, (state, action) => {
        state.isLoading = false;
        if (state.status) {
          state.status.isFunded = true;
          state.status.fundingTransactionHash = action.payload.transactionHash;
        }
        state.error = null;
      })
      .addCase(fundAccount.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Get Auto Funding Stats
      .addCase(getAutoFundingStats.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(getAutoFundingStats.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(getAutoFundingStats.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      // Get Transaction History
      .addCase(getTransactionHistory.pending, (state) => {
        state.transactions.isLoading = true;
        state.transactions.error = null;
      })
      .addCase(getTransactionHistory.fulfilled, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.transactions = action.payload;
        state.transactions.error = null;
      })
      .addCase(getTransactionHistory.rejected, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.error = action.payload as string;
      })
      // Get Account Transactions
      .addCase(getAccountTransactions.pending, (state) => {
        state.transactions.isLoading = true;
        state.transactions.error = null;
      })
      .addCase(getAccountTransactions.fulfilled, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.transactions = action.payload.transactions;
        state.transactions.error = null;
      })
      .addCase(getAccountTransactions.rejected, (state, action) => {
        state.transactions.isLoading = false;
        state.transactions.error = action.payload as string;
      })
      // Fetch Trustlines
      .addCase(fetchTrustlines.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(fetchTrustlines.fulfilled, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlines = action.payload;
        state.trustlinesError = null;
      })
      .addCase(fetchTrustlines.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = action.payload as string;
      })
      // Add Trustline
      .addCase(addAccountTrustline.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(addAccountTrustline.fulfilled, (state) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = null;
      })
      .addCase(addAccountTrustline.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = action.payload as string;
      })
      // Remove Trustline
      .addCase(removeAccountTrustline.pending, (state) => {
        state.isLoadingTrustlines = true;
        state.trustlinesError = null;
      })
      .addCase(removeAccountTrustline.fulfilled, (state) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = null;
      })
      .addCase(removeAccountTrustline.rejected, (state, action) => {
        state.isLoadingTrustlines = false;
        state.trustlinesError = action.payload as string;
      });
  },
});

export const {
  clearError,
  updateAccountStatus,
  updateBalance,
  clearAccount,
  setTrustlines,
  setLoadingTrustlines,
  setTrustlinesError,
  setTransactionFilter,
  clearTransactionFilters,
} = accountSlice.actions;
export default accountSlice.reducer;
