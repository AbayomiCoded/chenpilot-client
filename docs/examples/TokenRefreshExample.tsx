'use client';

import React, { useState, useEffect } from 'react';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { useAppSelector } from '@/store';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

export function TokenRefreshExample() {
  const { refreshToken, refreshTokenIfNeeded, isRefreshing, refreshError, isTokenExpired } = useTokenRefresh();
  const { token, isAuthenticated } = useAppSelector((state) => state.auth);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setLastRefreshTime(new Date(payload.iat * 1000));
      } catch (error) {
        console.error('Error parsing token:', error);
      }
    }
  }, [token]);

  const handleManualRefresh = async () => {
    const success = await refreshToken();
    if (success) {
      setLastRefreshTime(new Date());
    }
  };

  const handleAutoRefresh = async () => {
    const success = await refreshTokenIfNeeded();
    if (success) {
      setLastRefreshTime(new Date());
    }
  };

  const getTokenStatus = () => {
    if (!token) return { status: 'No Token', className: 'bg-red-100 text-red-800' };
    if (isTokenExpired()) return { status: 'Expired', className: 'bg-red-100 text-red-800' };
    return { status: 'Valid', className: 'bg-green-100 text-green-800' };
  };

  const tokenStatus = getTokenStatus();

  return (
    <Card className="w-full max-w-md">
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          JWT Token Auto-Refresh
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Demonstrates automatic JWT token refresh functionality
          </p>
        </div>
        {/* Authentication Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Authentication:</span>
          <span className={`rounded-full px-2 py-1 text-xs ${isAuthenticated ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
          </span>
        </div>

        {/* Token Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Token Status:</span>
          <span className={`rounded-full px-2 py-1 text-xs ${tokenStatus.className}`}>
            {tokenStatus.status}
          </span>
        </div>

        {/* Refresh Status */}
        {isRefreshing && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Refreshing token...
          </div>
        )}

        {/* Error Display */}
        {refreshError && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {refreshError}
          </div>
        )}

        {/* Success Message */}
        {lastRefreshTime && !refreshError && !isRefreshing && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle className="h-4 w-4" />
            Last refreshed: {lastRefreshTime.toLocaleTimeString()}
          </div>
        )}

        {/* Token Info */}
        {token && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Token Preview:</span>
              <div className="mt-1 p-2 bg-gray-100 rounded text-xs font-mono break-all">
                {token.substring(0, 50)}...
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button 
            onClick={handleManualRefresh} 
            disabled={isRefreshing || !isAuthenticated}
            className="w-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Manual Refresh
          </Button>
          
          <Button 
            onClick={handleAutoRefresh} 
            disabled={isRefreshing || !isAuthenticated}
            variant="secondary"
            className="w-full"
          >
            Auto Refresh (if needed)
          </Button>
        </div>

        {/* Instructions */}
        <div className="text-xs text-gray-600 space-y-1">
          <p>• <strong>Manual Refresh:</strong> Forces a token refresh</p>
          <p>• <strong>Auto Refresh:</strong> Only refreshes if token is expired</p>
          <p>• The API service automatically refreshes tokens on 401 errors</p>
        </div>
      </div>
    </Card>
  );
}
