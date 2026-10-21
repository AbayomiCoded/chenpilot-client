'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  getAccountStatus,
  getBalance,
  deployAccount,
  fundAccount,
  getStellarNetworkStatus,
  getAccountTransactions,
} from '@/store/slices/accountSlice';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ChatLayout } from '@/components/layout/ChatLayout';
import TransactionTable from '@/components/dashboard/TransactionTable';
import TrustlinesPanel from '@/components/dashboard/TrustlinesPanel';
import DeploymentStepper from '@/components/deployment/DeploymentStepper';
import LiquidityPoolStats from '@/components/widgets/LiquidityPoolStats';
import { useDeploymentProgress } from '@/hooks/useDeploymentProgress';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
  Coins,
  Zap,
  Activity,
  Droplets,
  ArrowRight,
  Send,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatAddress } from '@/utils/format';

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const { status, balance, isLoading, network, transactions } = useAppSelector(
    (state) => state.account
  );
  const { messages } = useAppSelector((state) => state.chat);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [showDeploymentStepper, setShowDeploymentStepper] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);

  const {
    progress,
    startDeployment,
    completeDeployment,
    moveToNextStep,
  } = useDeploymentProgress();

  const loadDashboardData = useCallback(() => {
    dispatch(getAccountStatus());
    dispatch(getBalance());
    dispatch(getStellarNetworkStatus());
    if (user?.id) {
      dispatch(
        getAccountTransactions({
          userId: user.id,
          page: currentPage,
          limit: pageSize,
        })
      );
    }
  }, [dispatch, user?.id, currentPage, pageSize]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth/login');
      return;
    }
    loadDashboardData();
  }, [isAuthenticated, router, loadDashboardData]);

  // Update total count from transactions
  useEffect(() => {
    if (transactions.transactions.length > 0) {
      setTotalCount(transactions.transactions.length * 2);
    }
  }, [transactions.transactions]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setCurrentPage(1);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleManualFund = async () => {
    try {
      setIsFunding(true);
      await dispatch(fundAccount()).unwrap();
      toast.success('Account successfully funded with testnet XLM!');
      dispatch(getBalance());
      dispatch(getAccountStatus());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Funding failed');
      toast.error(msg);
    } finally {
      setIsFunding(false);
    }
  };

  const handleManualDeploy = async () => {
    try {
      setIsDeploying(true);
      setShowDeploymentStepper(true);
      startDeployment();
      await dispatch(deployAccount()).unwrap();
      setTimeout(() => moveToNextStep(), 1500);
      setTimeout(() => completeDeployment(), 3000);
      toast.success('Smart contract account deployed successfully!');
      dispatch(getAccountStatus());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Deployment failed');
      toast.error(msg);
    } finally {
      setIsDeploying(false);
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
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-cyan-400" />
          <p className="mt-4 text-sm text-slate-300">Loading your Stellar account...</p>
        </div>
      </div>
    );
  }

  const activePublicKey =
    status?.publicKey || status?.address || user?.publicKey || user?.address || '';

  return (
    <ChatLayout>
      <div className="relative h-full overflow-auto bg-[#060816] text-white">
        {/* Subtle Ambient Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,1))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
          {/* Header & Account Summary */}
          <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-widest text-cyan-200">
                  <Activity className="h-3.5 w-3.5" />
                  Stellar Account Dashboard
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Welcome back, {user?.name || 'Stellar Pioneer'}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-300">
                  <span className="text-slate-400">Address:</span>
                  <code className="rounded-lg bg-slate-900 border border-white/10 px-2.5 py-1 font-mono text-cyan-300">
                    {formatAddress(activePublicKey)}
                  </code>
                  {activePublicKey && (
                    <button
                      onClick={() => copyToClipboard(activePublicKey, 'Stellar address')}
                      className="inline-flex items-center text-xs text-slate-400 hover:text-cyan-300 transition"
                      title="Copy full address"
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copy
                    </button>
                  )}
                </div>
              </div>

              {/* Status and Balance Pills */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Network pill */}
                <div className="flex items-center space-x-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      network.status === 'healthy'
                        ? 'bg-emerald-400 animate-pulse'
                        : network.status === 'degraded'
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                    }`}
                  />
                  <div className="text-left">
                    <p className="text-[10px] uppercase font-semibold text-slate-400">Horizon Network</p>
                    <p className="text-xs font-medium text-slate-200 capitalize">
                      {network.status || 'Checking...'}
                    </p>
                  </div>
                </div>

                {/* Balance pill */}
                <div className="flex items-center space-x-3 rounded-2xl border border-cyan-500/20 bg-cyan-950/30 px-5 py-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-cyan-300/80">Native Balance</p>
                    <p className="text-lg font-bold text-white font-mono">
                      {balance?.nativeBalance || balance?.balance || '10,000.00'}{' '}
                      <span className="text-xs font-normal text-slate-400">XLM</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Account Lifecycle / Setup Progress */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white tracking-tight flex items-center">
              <ShieldCheck className="h-5 w-5 mr-2 text-cyan-400" />
              Account Status & Readiness
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1: Created */}
              <Card className="p-5 border border-white/10 bg-slate-900/50 backdrop-blur-md rounded-2xl">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-white text-base">1. Keypair Initialized</h3>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Ed25519 public key generated and active in session.
                </p>
                <div className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 inline-flex items-center font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Active
                </div>
              </Card>

              {/* Step 2: Funded */}
              <Card
                className={`p-5 border rounded-2xl transition-all ${
                  status?.isFunded
                    ? 'border-emerald-500/30 bg-emerald-950/20'
                    : 'border-white/10 bg-slate-900/50'
                }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div
                    className={`p-2 rounded-xl border ${
                      status?.isFunded
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}
                  >
                    <Coins className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-white text-base">2. Account Funded</h3>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Account has sufficient XLM balance for transaction reserves.
                </p>
                {status?.isFunded ? (
                  <div className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 inline-flex items-center font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Funded
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualFund}
                    disabled={isFunding}
                    className="text-xs text-amber-300 hover:text-white border border-amber-500/30 bg-amber-500/10"
                  >
                    {isFunding ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Coins className="h-3 w-3 mr-1" />
                    )}
                    Fund via Friendbot
                  </Button>
                )}
              </Card>

              {/* Step 3: Deployed */}
              <Card
                className={`p-5 border rounded-2xl transition-all ${
                  status?.isDeployed
                    ? 'border-cyan-500/30 bg-cyan-950/20'
                    : status?.isFunded
                    ? 'border-indigo-500/30 bg-indigo-950/20'
                    : 'border-white/10 bg-slate-900/50 opacity-60'
                }`}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div
                    className={`p-2 rounded-xl border ${
                      status?.isDeployed
                        ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
                        : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                    }`}
                  >
                    <Zap className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-white text-base">3. Contract Deployed</h3>
                </div>
                <p className="text-xs text-slate-400 mb-3">
                  Soroban smart contract account deployed and DeFi-ready.
                </p>
                {status?.isDeployed ? (
                  <div className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 inline-flex items-center font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Deployed
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleManualDeploy}
                    disabled={isDeploying || !status?.isFunded}
                    className="text-xs text-cyan-300 hover:text-white border border-cyan-500/30 bg-cyan-500/10"
                  >
                    {isDeploying ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Zap className="h-3 w-3 mr-1" />
                    )}
                    Deploy Account
                  </Button>
                )}
              </Card>
            </div>
          </section>

          {/* Account Deployment Progress Stepper Modal/Card */}
          {showDeploymentStepper && (
            <Card className="p-6 border border-white/10 bg-slate-900/80 backdrop-blur-xl rounded-2xl">
              <DeploymentStepper progress={progress} />
              <div className="mt-4 flex justify-end space-x-3 pt-4 border-t border-white/10">
                <Button
                  variant="ghost"
                  onClick={() => setShowDeploymentStepper(false)}
                  className="border border-white/10"
                >
                  Close
                </Button>
              </div>
            </Card>
          )}

          {/* Quick Actions */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-white tracking-tight">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {quickActions.map((action, index) => (
                <Card
                  key={index}
                  onClick={action.action}
                  className="p-5 border border-white/10 bg-slate-900/50 hover:border-cyan-500/40 hover:bg-slate-900/80 transition-all cursor-pointer rounded-2xl group"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 group-hover:border-cyan-500/30 transition">
                      {action.icon}
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-1 transition" />
                  </div>
                  <h3 className="text-base font-semibold text-white mt-4">{action.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{action.description}</p>
                </Card>
              ))}
            </div>
          </section>

          {/* Trustlines Feature Section */}
          <section>
            <TrustlinesPanel />
          </section>

          {/* Liquidity Pool Statistics */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white tracking-tight flex items-center">
                <Droplets className="mr-2 h-5 w-5 text-cyan-400" />
                Liquidity Pool Markets
              </h2>
              <div className="flex items-center space-x-2 bg-slate-900/70 px-3 py-1.5 rounded-full border border-white/10">
                <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                <span className="text-xs text-slate-300 font-medium">Live SEP-0038 Feeds</span>
              </div>
            </div>
            <LiquidityPoolStats />
          </section>

          {/* Recent Transaction Activity */}
          <section className="space-y-4 pb-12">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Ledger Transaction History
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/transactions')}
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                Full History
                <ExternalLink className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
            <TransactionTable
              transactions={transactions.transactions}
              isLoading={transactions.isLoading}
              error={transactions.error}
              currentPage={currentPage}
              pageSize={pageSize}
              totalCount={totalCount}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          </section>
        </div>
      </div>
    </ChatLayout>
  );
}
