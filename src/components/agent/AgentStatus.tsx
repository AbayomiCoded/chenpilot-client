'use client';

import React, { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { updateAgentStatus } from '@/store/slices/chatSlice';
import { 
  Wifi, 
  WifiOff, 
  Activity, 
  Zap, 
  DollarSign, 
  Bitcoin, 
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  HelpCircle,
  Loader2
} from 'lucide-react';
import apiService from '@/services/api';
import { AgentStatus as AgentStatusType, AgentCapabilitiesResult, ServiceStatus } from '@/types/agent';
import { isCapabilitiesStale } from '@/services/agentService';

const UNAVAILABLE = 'Unavailable';

/** Format a metric that may be unknown (#271). */
export function formatUptime(seconds: number | null): string {
  if (seconds === null) return UNAVAILABLE;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `${hours}h`;
  return `${Math.floor(seconds / 60)}m`;
}


/** Explanation shown when capability data can't be trusted as live (#270). */
export function capabilityNotice(result: AgentCapabilitiesResult | null, now = Date.now()): string | null {
  if (!result) return null;
  if (result.availability === 'unavailable') {
    return "Capabilities are unavailable right now: the agent couldn't be reached. Actions are disabled until it responds.";
  }
  if (result.availability === 'unsupported') {
    return "This agent doesn't report its capabilities. The actions below are the app's defaults and may not be enabled in this environment.";
  }
  if (isCapabilitiesStale(result, now)) {
    return 'Capability data may be out of date. Refresh to check again.';
  }
  return null;
}

interface AgentStatusProps {
  className?: string;
  showDetails?: boolean;
}

export default function AgentStatus({ className = '', showDetails = false }: AgentStatusProps) {
  const dispatch = useAppDispatch();
  const { agentStatus } = useAppSelector((state) => state.chat);
  const [status, setStatus] = useState<AgentStatusType | null>(null);
  const [capabilities, setCapabilities] = useState<AgentCapabilitiesResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const checkAgentStatus = async () => {
    setIsLoading(true);
    try {
      // Try to get status and capabilities, but don't fail if they're not available
      const [statusData, capabilitiesData] = await Promise.allSettled([
        apiService.getAgentStatus(),
        apiService.getAgentCapabilities()
      ]);
      
      const status = statusData.status === 'fulfilled' ? statusData.value : null;
      const capabilities = capabilitiesData.status === 'fulfilled' ? capabilitiesData.value : null;
      
      setStatus(status);
      setCapabilities(capabilities);
      
      // Online only when a real health probe says so; capabilities are local and prove nothing (#271)
      const isConnected = status?.isOnline === true;
      
      dispatch(updateAgentStatus({
        isConnected,
        lastHealthCheck: new Date().toISOString(),
        capabilities
      }));
      
      setLastCheck(new Date());
    } catch (error) {
      console.error('Failed to check agent status:', error);
      dispatch(updateAgentStatus({
        isConnected: false,
        lastHealthCheck: new Date().toISOString(),
        capabilities: null
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAgentStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkAgentStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = () => {
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    }
    
    if (agentStatus.isConnected) {
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    } else {
      return <XCircle className="h-4 w-4 text-red-400" />;
    }
  };

  const getStatusText = () => {
    if (isLoading) {
      return 'Checking...';
    }
    
    if (agentStatus.isConnected) {
      return 'Agent Online';
    } else {
      return 'Agent Offline';
    }
  };

  const getStatusColor = () => {
    if (isLoading) {
      return 'text-blue-400';
    }
    
    if (agentStatus.isConnected) {
      return 'text-green-400';
    } else {
      return 'text-red-400';
    }
  };

  const getServiceIcon = (serviceName: string) => {
    switch (serviceName.toLowerCase()) {
      case 'vesu':
        return <DollarSign className="h-3 w-3" />;
      case 'atomiq':
        return <Zap className="h-3 w-3" />;
      case 'xverse':
        return <Bitcoin className="h-3 w-3" />;
      case 'troves':
        return <Building2 className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  const getServiceStatus = (service: ServiceStatus) => {
    if (service.isHealthy === true) {
      return <CheckCircle className="h-3 w-3 text-green-400" aria-label="Healthy" />;
    }
    if (service.isHealthy === false) {
      return <AlertCircle className="h-3 w-3 text-yellow-400" aria-label="Unhealthy" />;
    }
    return <HelpCircle className="h-3 w-3 text-gray-500" aria-label="Unknown" />;
  };

  if (!showDetails) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        {getStatusIcon()}
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900/80 backdrop-blur-sm border border-gray-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          {getStatusIcon()}
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        
        <button
          onClick={checkAgentStatus}
          disabled={isLoading}
          className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh status"
        >
          <Activity className="h-4 w-4" />
        </button>
      </div>

      {status && (
        <div className="space-y-3">
          <div className="text-xs text-gray-400" data-testid="agent-metrics">
            Version: {status.version ?? UNAVAILABLE} | Uptime: {formatUptime(status.uptime)} | Connections:{' '}
            {status.activeConnections ?? UNAVAILABLE}
          </div>

          {status.health && (
            <div className="text-xs text-gray-400" data-testid="agent-health">
              {status.health.responseTimeMs !== null ? `Response time: ${status.health.responseTimeMs} ms` : 'Response time: no response'}
              {status.health.probe === 'connectivity' && ' (connectivity check only)'}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-300">Services</div>
            {Object.keys(status.services).length === 0 ? (
              <p className="text-xs text-gray-500">
                Protocol health is unavailable: the agent backend doesn&apos;t report it yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(status.services).map(([name, service]) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-gray-800/50 rounded">
                    <div className="flex items-center space-x-2">
                      {getServiceIcon(name)}
                      <span className="text-xs text-gray-300 capitalize">{name}</span>
                    </div>
                    {getServiceStatus(service)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {capabilities && (
            <div className="space-y-2" data-testid="agent-capabilities" data-availability={capabilities.availability}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-300">Capabilities</span>
                <span className="text-gray-500">
                  {capabilities.source === 'backend'
                    ? 'Reported by agent'
                    : capabilities.source === 'local_fallback'
                      ? 'App defaults (not confirmed)'
                      : 'Unknown'}
                  {' · '}
                  <time dateTime={capabilities.fetchedAt}>
                    checked {new Date(capabilities.fetchedAt).toLocaleTimeString()}
                  </time>
                </span>
              </div>
              {capabilityNotice(capabilities) && (
                <p role="note" className="text-xs text-yellow-300">
                  {capabilityNotice(capabilities)}
                </p>
              )}
              {capabilities.capabilities ? (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(capabilities.capabilities.features)
                    .filter(([, enabled]) => enabled)
                    .map(([feature]) => {
                      const confirmed = capabilities.availability === 'available';
                      return (
                        <span
                          key={feature}
                          aria-disabled={!confirmed}
                          title={confirmed ? undefined : 'Not confirmed for this environment'}
                          className={`px-2 py-1 text-xs rounded ${
                            confirmed
                              ? 'bg-purple-600/20 text-purple-300'
                              : 'bg-gray-800 text-gray-500 line-through decoration-gray-600'
                          }`}
                        >
                          {feature}
                        </span>
                      );
                    })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No capabilities to show.</p>
              )}
            </div>
          )}

          {lastCheck && (
            <div className="text-xs text-gray-500">
              Last check: {lastCheck.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
