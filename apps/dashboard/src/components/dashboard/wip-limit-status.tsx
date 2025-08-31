'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WipData {
  stage: string;
  current: number;
  limit: number;
  trend: number; // percentage change from last period
}

interface WipLimitData {
  overall: {
    current: number;
    limit: number;
    utilization: number;
  };
  byStage: WipData[];
  violations: Array<{
    id: string;
    stage: string;
    severity: 'warning' | 'critical';
    duration: string; // how long over limit
  }>;
}

// Mock data
const mockWipData: WipLimitData = {
  overall: {
    current: 86,
    limit: 100,
    utilization: 86,
  },
  byStage: [
    { stage: 'Ideation', current: 45, limit: 50, trend: 12.5 },
    { stage: 'Validation', current: 23, limit: 30, trend: -5.2 },
    { stage: 'Development', current: 18, limit: 25, trend: 8.1 },
    { stage: 'Testing', current: 12, limit: 15, trend: -10.3 },
    { stage: 'Deployment', current: 8, limit: 10, trend: 14.8 },
  ],
  violations: [
    {
      id: '1',
      stage: 'Testing',
      severity: 'warning',
      duration: '2 hours',
    },
  ],
};

async function fetchWipData(): Promise<WipLimitData> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockWipData;
}

function WipBar({ data }: { data: WipData }) {
  const utilization = (data.current / data.limit) * 100;
  const isOverLimit = data.current > data.limit;
  const isNearLimit = utilization > 80 && !isOverLimit;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-900">{data.stage}</span>
        <div className="flex items-center space-x-2">
          <span className={cn(
            'font-medium',
            isOverLimit ? 'text-red-600' : 
            isNearLimit ? 'text-yellow-600' : 'text-gray-900'
          )}>
            {data.current}/{data.limit}
          </span>
          <div className={cn(
            'flex items-center text-xs',
            data.trend >= 0 ? 'text-red-500' : 'text-green-500'
          )}>
            {data.trend >= 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(data.trend).toFixed(1)}%
          </div>
        </div>
      </div>
      
      <div className="relative">
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={cn(
              'h-3 rounded-full transition-all duration-300',
              isOverLimit ? 'bg-red-500' :
              isNearLimit ? 'bg-yellow-500' : 'bg-green-500'
            )}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
        {/* Limit indicator */}
        <div 
          className="absolute top-0 h-3 w-0.5 bg-gray-400"
          style={{ left: '80%' }}
        />
      </div>
    </div>
  );
}

export function WipLimitStatus() {
  const { data: wipData, isLoading, error } = useQuery({
    queryKey: ['wipLimits'],
    queryFn: fetchWipData,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WIP Limit Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse" />
                <div className="h-3 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !wipData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WIP Limit Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 text-center py-8">
            Failed to load WIP data
          </div>
        </CardContent>
      </Card>
    );
  }

  const overallUtilization = wipData.overall.utilization;
  const isSystemOverCapacity = overallUtilization > 100;
  const isSystemNearCapacity = overallUtilization > 80 && !isSystemOverCapacity;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>WIP Limit Status</CardTitle>
          <Badge
            variant={
              isSystemOverCapacity ? 'destructive' :
              isSystemNearCapacity ? 'warning' : 'secondary'
            }
            className="text-xs"
          >
            {overallUtilization.toFixed(0)}% Utilized
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Status */}
        <div className="p-4 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Overall WIP</span>
            <span className="text-sm font-bold text-gray-900">
              {wipData.overall.current}/{wipData.overall.limit}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={cn(
                'h-4 rounded-full transition-all duration-300',
                isSystemOverCapacity ? 'bg-red-500' :
                isSystemNearCapacity ? 'bg-yellow-500' : 'bg-green-500'
              )}
              style={{ width: `${Math.min(overallUtilization, 100)}%` }}
            />
          </div>
        </div>

        {/* By Stage */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-900">By Stage</h4>
          {wipData.byStage.map((stageData) => (
            <WipBar key={stageData.stage} data={stageData} />
          ))}
        </div>

        {/* Violations */}
        {wipData.violations.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center space-x-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <h4 className="text-sm font-medium text-gray-900">Active Violations</h4>
            </div>
            <div className="space-y-2">
              {wipData.violations.map((violation) => (
                <div
                  key={violation.id}
                  className="flex items-center justify-between p-2 bg-yellow-50 rounded-md"
                >
                  <span className="text-sm text-yellow-800">
                    {violation.stage} over limit
                  </span>
                  <Badge
                    variant={violation.severity === 'critical' ? 'destructive' : 'warning'}
                    className="text-xs"
                  >
                    {violation.duration}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="pt-4 border-t">
          <div className="flex space-x-2">
            <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              View Details →
            </button>
            <button className="text-sm text-gray-600 hover:text-gray-700">
              Adjust Limits
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}