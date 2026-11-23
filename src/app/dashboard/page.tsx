"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/store";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChatLayout } from "@/components/layout/ChatLayout";
import apiService from "@/services/api";
import type { PromptVersion, PromptVersionRecord } from "@/types";

const DEFAULT_TEST_INPUT = "Help a user move idle USDC into the highest-yield low-risk strategy.";
const DEFAULT_VARIABLES = JSON.stringify(
  {
    agentName: "ChenPilot",
    userName: "Ada",
    network: "mainnet",
    riskLevel: "low",
    tone: "clear and confident",
  },
  null,
  2,
);

function isRecord(value: unknown): value is PromptVersionRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
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

  const directCollections = [payload.versions, payload.data, payload.items, payload.results];
  for (const candidate of directCollections) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }

  if (isRecord(payload.data)) {
    const nestedCollections = [payload.data.versions, payload.data.items, payload.data.results];
    for (const candidate of nestedCollections) {
      if (Array.isArray(candidate)) return candidate.filter(isRecord);
    }
  }
  return [];
}

function normalizeVersion(record: PromptVersionRecord, index: number): PromptVersion {
  const id = getString(record.id) ?? getString(record._id) ?? getString(record.uuid) ?? `version-${index + 1}`;
  const tags = getArray(record.tags)
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean);

  return {
    id,
    label: getString(record.name) ?? getString(record.title) ?? `Template ${index + 1}`,
    description: getString(record.description) ?? "No description provided for this prompt version.",
    template: getString(record.template) ?? getString(record.prompt) ?? "",
    version: getString(record.version) ?? id,
    isActive: getBoolean(record.isActive) ?? getBoolean(record.active) ?? false,
    createdAt: getString(record.createdAt) ?? getString(record.created_at) ?? null,
    updatedAt: getString(record.updatedAt) ?? getString(record.updated_at) ?? null,
    tags,
    raw: record,
  };
}

function parseVariables(rawValue: string): { parsed: Record<string, string>; error: string | null } {
  try {
    const value = JSON.parse(rawValue) as unknown;

    if (!isRecord(value)) {
      return { parsed: {}, error: "Variables must be a JSON object." };
    }

    const flattened = Object.entries(value).reduce<Record<string, string>>((accumulator, [key, entry]) => {
      accumulator[key] = entry == null ? "" : typeof entry === "string" ? entry : JSON.stringify(entry);
      return accumulator;
    }, {});
    return { parsed: flattened, error: null };
  } catch {
    return { parsed: {}, error: "Variables JSON is invalid." };
  }
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`)
    .replace(/\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g, (_, key: string) => variables[key] ?? `\${${key}}`);
}

function getPlaceholders(template: string): string[] {
  const matches = template.match(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}|\$\{\s*([a-zA-Z0-9_.-]+)\s*\}/g) ?? [];
  const normalized = matches.map((placeholder) => placeholder.replace(/^\{\{\s*|\s*\}\}$|^\$\{\s*|\s*\}$/g, ""));
  return Array.from(new Set(normalized));
}

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const { status, balance, network, transactions } = useAppSelector((state) => state.account);
  const { messages } = useAppSelector((state) => state.chat);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingVersions, setIsLoadingVersions] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testInput, setTestInput] = useState(DEFAULT_TEST_INPUT);
  const [variablesText, setVariablesText] = useState(DEFAULT_VARIABLES);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    dispatch(loadUser());
    dispatch(getAccountStatus());
    dispatch(getBalance());
    dispatch(getStellarNetworkStatus());
  }, [dispatch, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      dispatch(getAccountTransactions({ userId: user.id, page: currentPage, limit: pageSize }));
    }
  }, [currentPage, dispatch, isAuthenticated, pageSize, user?.id]);

  const loadVersions = async (showRefreshState = false) => {
    if (showRefreshState) setIsRefreshing(true);
    else setIsLoadingVersions(true);

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
      const message = requestError instanceof Error ? requestError.message : "Failed to load prompt versions.";
      setError(message);
    } finally {
      setIsLoadingVersions(false);
      setIsRefreshing(false);
    }
  }, [dispatch, user?.id, currentPage, pageSize]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    void loadVersions();
  }, [isAuthenticated, router]);

  const selectedVersion = useMemo(
    () => versions.find((version) => version.id === selectedId) ?? versions[0] ?? null,
    [selectedId, versions],
  );
  const activeVersion = useMemo(() => versions.find((version) => version.isActive) ?? null, [versions]);
  const parsedVariables = useMemo(() => {
    const { parsed, error: parseError } = parseVariables(variablesText);
    return {
      variables: {
        ...parsed,
        input: testInput,
        userInput: testInput,
        user_query: testInput,
      } as Record<string, string>,
      error: parseError,
    };
  }, [testInput, variablesText]);

  const renderedPrompt = useMemo(() => {
    if (!selectedVersion) {
      return "";
    }
    return renderTemplate(selectedVersion.template, parsedVariables.variables);
  }, [parsedVariables.variables, selectedVersion]);

  const unresolvedPlaceholders = useMemo(() => {
    if (!selectedVersion) {
      return [];
    }
    return getPlaceholders(selectedVersion.template).filter(
      (placeholder) => parsedVariables.variables[placeholder] === undefined,
    );
  }, [parsedVariables.variables, selectedVersion]);

  const handleActivate = async () => {
    if (!selectedVersion || selectedVersion.isActive) return;
    setIsActivating(true);
    try {
      await apiService.activatePromptVersion(selectedVersion.id);
      setVersions((currentVersions) =>
        currentVersions.map((version) => ({
          ...version,
          isActive: version.id === selectedVersion.id,
        })),
      );
    } catch (requestError: unknown) {
      const message = requestError instanceof Error ? requestError.message : "Failed to activate the selected version.";
      setError(message);
    } finally {
      setIsDeploying(false);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };
  const quickActions = [
    {
      title: 'Send Payment',
      description: 'Transfer native XLM or custom anchored assets',
      icon: <Send className="h-5 w-5 text-cyan-400" />,
      action: () => router.push('/send'),
    },
    {
      title: 'View Transactions',
      description: 'Check complete ledger history and operations',
      icon: <Coins className="h-5 w-5 text-emerald-400" />,
      action: () => router.push('/transactions'),
    },
    {
      title: 'Manage Contacts',
      description: 'Save Stellar addresses for fast recurring transfers',
      icon: <Users className="h-5 w-5 text-indigo-400" />,
      action: () => router.push('/contacts'),
    },
  ];

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060816] text-white">
        <div className="text-center">
          <p className="text-lg text-slate-300">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  const activePublicKey =
    status?.publicKey ||
    status?.address ||
    user?.publicKey ||
    user?.address ||
    '';

  return (
    <ChatLayout>
      <div className="h-full overflow-auto bg-[#060816] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl shadow-cyan-950/20">
            <h1 className="text-3xl font-semibold">Prompt version dashboard</h1>
            <p className="mt-2 text-sm text-slate-300">
              Review or promote prompt versions for {user?.name ?? "your account"}.
            </p>
          </section>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Prompt versions</h2>
                <Button
                  variant="secondary"
                  onClick={() => void loadVersions(true)}
                  disabled={isRefreshing || isLoading}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </div>

              {isLoading ? (
                <p className="text-sm text-slate-300">Loading prompt versions…</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-slate-300">No prompt versions available yet.</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setSelectedId(version.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedVersion?.id === version.id
                          ? "border-cyan-400 bg-cyan-500/10"
                          : "border-white/10 bg-slate-900/50 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-white">{version.label}</span>
                        {version.isActive && (
                          <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-green-300">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{version.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="text-xl font-semibold">Preview</h2>
              {selectedVersion ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm whitespace-pre-wrap text-slate-200">
                    {renderedPrompt || "Select a prompt version to preview it."}
                  </div>
                  <Button onClick={handleActivate} disabled={isActivating || selectedVersion.isActive}>
                    {isActivating ? "Activating..." : selectedVersion.isActive ? "Active" : "Activate version"}
                  </Button>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-300">No version selected.</p>
              )}
            </Card>
          </div>

          <Card>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Test input</label>
                <textarea
                  value={testInput}
                  onChange={(event) => setTestInput(event.target.value)}
                  className="min-h-[100px] w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-200">Variables (JSON)</label>
                <textarea
                  value={variablesText}
                  onChange={(event) => setVariablesText(event.target.value)}
                  className="min-h-[140px] w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white font-mono"
                />
              </div>

              {parsedVariables.error && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
                  {parsedVariables.error}
                </div>
              )}

              {unresolvedPlaceholders.length > 0 && (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-200">
                  Missing variables: {unresolvedPlaceholders.join(", ")}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </ChatLayout>
  );
}
```