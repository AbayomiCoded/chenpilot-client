'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import { getAccountStatus, getBalance, deployAccount, fundAccount, getStellarNetworkStatus, getAccountTransactions } from '@/store/slices/accountSlice';
import { loadUser } from '@/store/slices/authSlice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChatLayout } from '@/components/layout/ChatLayout';
import TransactionTable from '@/components/dashboard/TransactionTable';
import DeploymentStepper from '@/components/deployment/DeploymentStepper';
import { useDeploymentProgress } from '@/hooks/useDeploymentProgress';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clipboard,
  FlaskConical,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
  ShieldCheck,
  Wallet,
  Coins,
  Zap,
  Activity,
  Droplets,
  ExternalLink,
  Circle,
  ShieldLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import apiService from '@/services/api';
import { PromptVersion, PromptVersionRecord } from '@/types';

const DEFAULT_TEST_INPUT = 'Help a user move idle USDC into the highest-yield low-risk strategy.';
const DEFAULT_VARIABLES = JSON.stringify(
  {
    agentName: 'ChenPilot',
    userName: 'Ada',
    network: 'mainnet',
    riskLevel: 'low',
    tone: 'clear and confident'
  },
  null,
  2
);

function isRecord(value: unknown): value is PromptVersionRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
import LiquidityPoolStats from '@/components/widgets/LiquidityPoolStats';

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const { status, balance, isLoading, network, transactions } = useAppSelector((state) => state.account);
  const { messages } = useAppSelector((state) => state.chat);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [showDeploymentStepper, setShowDeploymentStepper] = useState(false);
  
  const { progress, startDeployment, completeDeployment, failDeployment, moveToNextStep } = useDeploymentProgress();

  const quickActions = [
    {
      title: 'Deploy Account',
      description: 'Deploy your Stellar smart contract account',
      action: () => setShowDeploymentStepper(true),
    },
    {
      title: 'View Transactions',
      description: 'Check your recent transaction history',
      action: () => router.push('/transactions'),
    },
    {
      title: 'Manage Contacts',
      description: 'Add and manage your payment contacts',
      action: () => router.push('/contacts'),
    },
  ];

function getBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function extractVersionRecords(payload: unknown): PromptVersionRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const directCollections = [
    payload.versions,
    payload.data,
    payload.items,
    payload.results
  ];

  for (const candidate of directCollections) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
  }

  if (isRecord(payload.data)) {
    const nestedCollections = [
      payload.data.versions,
      payload.data.items,
      payload.data.results
    ];

    for (const candidate of nestedCollections) {
      if (Array.isArray(candidate)) {
        return candidate.filter(isRecord);
      }
    }
  }

  return [];
}

function getTemplate(record: PromptVersionRecord): string {
  return (
    getString(record.template) ??
    getString(record.prompt) ??
    getString(record.systemPrompt) ??
    getString(record.content) ??
    getString(record.body) ??
    getString(record.text) ??
    ''
  );
}

function getLabel(record: PromptVersionRecord, fallbackIndex: number): string {
  return (
    getString(record.name) ??
    getString(record.title) ??
    getString(record.label) ??
    getString(record.version) ??
    `Template ${fallbackIndex + 1}`
  );
}

function normalizeVersion(record: PromptVersionRecord, index: number): PromptVersion {
  const id =
    getString(record.id) ??
    getString(record._id) ??
    getString(record.uuid) ??
    `version-${index + 1}`;

  const rawTags = getArray(record.tags);
  const tags = rawTags
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);

  const activeFlag =
    getBoolean(record.isActive) ??
    getBoolean(record.active) ??
    getBoolean(record.is_active) ??
    (getString(record.status)?.toLowerCase() === 'active');

  return {
    id,
    label: getLabel(record, index),
    description:
      getString(record.description) ??
      getString(record.summary) ??
      getString(record.notes) ??
      'No description provided for this prompt version.',
    template: getTemplate(record),
    version: getString(record.version) ?? id,
    isActive: Boolean(activeFlag),
    createdAt:
      getString(record.createdAt) ??
      getString(record.created_at) ??
      getString(record.insertedAt) ??
      null,
    updatedAt:
      getString(record.updatedAt) ??
      getString(record.updated_at) ??
      getString(record.modifiedAt) ??
      null,
    tags,
    raw: record
  };
}

function safelyFormatDate(value: string | null): string {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function parseVariables(rawValue: string): { parsed: Record<string, string>; error: string | null } {
  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!isRecord(value)) {
      return { parsed: {}, error: 'Variables must be a JSON object.' };
    }

    const flattened = Object.entries(value).reduce<Record<string, string>>((accumulator, [key, entry]) => {
      if (entry === null || entry === undefined) {
        accumulator[key] = '';
      } else if (typeof entry === 'string') {
        accumulator[key] = entry;
      } else {
        accumulator[key] = JSON.stringify(entry);
      }

      return accumulator;
    }, {});

    return { parsed: flattened, error: null };
  } catch {
    return { parsed: {}, error: 'Variables JSON is invalid.' };
  }
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => variables[key] ?? match)
    .replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (match, key: string) => variables[key] ?? match);
}

function getPlaceholders(template: string): string[] {
  const placeholderMatches = template.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g) ?? [];
  const normalized = placeholderMatches.map((placeholder) =>
    placeholder.replace(/^\{\{\s*|\s*\}\}$|^\$\{\s*|\s*\}$/g, '')
  );

  return Array.from(new Set(normalized));
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState(DEFAULT_TEST_INPUT);
  const [variablesText, setVariablesText] = useState(DEFAULT_VARIABLES);

  const loadVersions = async (showRefreshState = false) => {
    if (showRefreshState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setError(null);
      const response = await apiService.getPromptVersions();
      const normalizedVersions = extractVersionRecords(response).map(normalizeVersion);

      setVersions(normalizedVersions);
      setSelectedId((currentSelectedId) => {
        if (currentSelectedId && normalizedVersions.some((version) => version.id === currentSelectedId)) {
          return currentSelectedId;
        }

        return normalizedVersions.find((version) => version.isActive)?.id ?? normalizedVersions[0]?.id ?? null;
      });
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to load prompt versions.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }

    void loadVersions();
  }, [isAuthenticated, router]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? versions[0] ?? null,
    [selectedId, versions]
  );

  const activeVersion = useMemo(
    () => versions.find((version) => version.isActive) ?? null,
    [versions]
  );

  const parsedVariables = useMemo(() => {
    const { parsed, error: parseError } = parseVariables(variablesText);

    return {
      variables: {
        ...parsed,
        input: testInput,
        userInput: testInput,
        user_query: testInput
      },
      error: parseError
    };
  }, [testInput, variablesText]);

  const renderedPrompt = useMemo(() => {
    if (!selectedVersion) {
      return '';
    }

    return renderTemplate(selectedVersion.template, parsedVariables.variables);
  }, [parsedVariables.variables, selectedVersion]);

  const unresolvedPlaceholders = useMemo(() => {
    if (!selectedVersion) {
      return [];
    }
  // Fetch transactions
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      return;
    }

    dispatch(getAccountTransactions({ userId: user.id, page: currentPage, limit: pageSize }));
  }, [dispatch, isAuthenticated, user?.id, currentPage, pageSize]);

  // Update total count from API response
  useEffect(() => {
    // This will be set when the API response comes back with pagination data
    if (transactions.transactions.length > 0) {
      // Mock total count calculation - in production this would come from API
      setTotalCount(transactions.transactions.length * 2);
    }
  }, [transactions.transactions]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

    return getPlaceholders(selectedVersion.template).filter(
      (placeholder) => parsedVariables.variables[placeholder] === undefined
    );
  }, [parsedVariables.variables, selectedVersion]);

  const handleActivate = async () => {
    if (!selectedVersion || selectedVersion.isActive) {
      return;
    }

    setIsActivating(true);

    try {
      await apiService.activatePromptVersion(selectedVersion.id);
      setVersions((currentVersions) =>
        currentVersions.map((version) => ({
          ...version,
          isActive: version.id === selectedVersion.id
        }))
      );
      toast.success(`${selectedVersion.label} is now active`);
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error ? requestError.message : 'Failed to activate the selected version.';
      toast.error(message);
    } finally {
      setIsActivating(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060816] text-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-400" />
          <p className="mt-4 text-sm text-slate-300">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <ChatLayout>
      <div className="relative h-full overflow-auto bg-[#060816] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_25%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,1))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-cyan-200">
                  <ShieldLine />
                  Prompt Version Control
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Agent prompt management dashboard
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
                  Review every available prompt version, simulate template output with sample variables, and promote the best version without leaving the admin workspace.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
              {/* Step 3: Deployed */}
              <Card className={`relative overflow-hidden border-2 transition-all duration-500 ${status?.isDeployed ? 'border-green-500/50 bg-green-500/5' : status?.isFunded ? 'border-purple-500/30 bg-purple-500/5' : 'border-gray-800 opacity-50'}`}>
                <div className="flex items-start justify-between">
                  <div className="z-10">
                    <div className="flex items-center mb-2">
                      <div className={`p-2 rounded-lg mr-3 ${status?.isDeployed ? 'bg-green-500/20' : status?.isFunded ? 'bg-purple-500/20' : 'bg-gray-800'}`}>
                        <Zap className={`h-5 w-5 ${status?.isDeployed ? 'text-green-400' : status?.isFunded ? 'text-purple-400' : 'text-gray-400'}`} />
                      </div>
                      <h3 className={`font-bold ${status?.isDeployed ? 'text-green-400' : status?.isFunded ? 'text-purple-400' : 'text-gray-400'}`}>3. Deployed</h3>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">Account is live and DeFi-ready.</p>
                    {status?.isDeployed ? (
                      <div className="space-y-2">
                        <div className="text-xs py-1 px-2 bg-green-500/20 text-green-400 rounded-full inline-flex items-center border border-green-500/30">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Full Access
                        </div>
                        <div className="flex items-center text-xs text-green-500 font-medium">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Deployed
                        </div>
                      </div>
                    ) : status?.isFunded ? (
                      <div className="flex items-center text-xs text-purple-400 font-medium animate-pulse">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Finalizing deployment...
                      </div>
                    ) : (
                      <div className="flex items-center text-xs text-gray-500">
                        <Circle className="h-3 w-3 mr-1" /> Waiting for funding
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Account Deployment Progress */}
          {showDeploymentStepper && (
            <Card className="mb-8">
              <DeploymentStepper progress={progress} />
              <div className="mt-4 flex justify-end space-x-3 pt-4 border-t border-gray-700">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeploymentStepper(false)}
                >
                  Close
                </Button>
                {!progress.isComplete && !progress.hasError && (
                  <Button
                    onClick={() => {
                      // Simulate deployment progress
                      startDeployment();
                      setTimeout(() => moveToNextStep(), 2000);
                      setTimeout(() => moveToNextStep(), 4000);
                      setTimeout(() => moveToNextStep(), 6000);
                      setTimeout(() => moveToNextStep(), 8000);
                      setTimeout(() => completeDeployment(), 10000);
                    }}
                  >
                    Start Deployment
                  </Button>
                )}
                {progress.hasError && (
                  <Button
                    onClick={() => {
                      setShowDeploymentStepper(false);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Card key={index} className="cursor-pointer hover:shadow-lg transition-shadow">
                  <div className="flex items-start space-x-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {action.title}
                      </h3>
                      <p className="text-gray-300 mb-4">
                        {action.description}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={action.action}
                      >
                        Get Started
                        <ExternalLink className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Liquidity Pool Stats */}
          <div className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center">
                <Droplets className="mr-2 h-6 w-6 text-blue-400" />
                Liquidity Pool Statistics
              </h2>
              <div className="flex items-center space-x-2 bg-gray-900/50 px-3 py-1.5 rounded-full border border-gray-800">
                <Activity className="h-4 w-4 text-green-400" />
                <span className="text-xs font-medium text-gray-300">
                  Live Data
                </span>
              </div>
            </div>
            <LiquidityPoolStats />
          </div>

          {/* Recent Activity */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">
              Recent Activity
            </h2>
            <Card>
              {messages.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-white">
                      Recent Chat Messages
                    </h3>
                  </div>
                  <p className="text-gray-400">
                    {messages.length} message{messages.length !== 1 ? 's' : ''}
                  </p>
                </div>
              ) : (
                <p className="text-gray-400 text-center py-8">
                  No recent activity
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </ChatLayout>
  );
}
