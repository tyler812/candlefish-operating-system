'use client';

import React from 'react';
import { useWebSocket } from '@/lib/websocket';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export function Header() {
  const { connected, systemStatus } = useWebSocket();

  const getSystemStatusColor = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'critical':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-semibold text-gray-900">
              System Overview
            </h1>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Real-time connection status */}
            <div className="flex items-center space-x-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                connected ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-sm text-gray-600">
                {connected ? 'Live' : 'Disconnected'}
              </span>
            </div>

            {/* System health status */}
            {systemStatus && (
              <Badge 
                variant="secondary" 
                className={cn(
                  'text-white border-0',
                  getSystemStatusColor(systemStatus.overall)
                )}
              >
                System {systemStatus.overall}
              </Badge>
            )}

            {/* Last updated */}
            <span className="text-xs text-gray-500">
              Updated {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}