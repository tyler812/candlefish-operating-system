'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { cn, calculateHealthScore } from '@/lib/utils';

interface PodHealthData {
  id: string;
  name: string;
  lead: string;
  memberCount: number;
  healthScore: number;
  trend: number;
  metrics: {
    throughput: number;
    cycleTime: number;
    qualityScore: number;
    satisfactionScore: number;
  };
  status: 'healthy' | 'warning' | 'critical';
  lastUpdated: Date;
}

interface PodHealthOverview {
  pods: PodHealthData[];
  systemAverage: number;
  alertCount: number;
}

// Mock data
const mockPodHealth: PodHealthOverview = {
  pods: [
    {
      id: '1',
      name: 'Alpha Squad',
      lead: 'Sarah Chen',
      memberCount: 6,
      healthScore: 92,
      trend: 5.2,
      metrics: {
        throughput: 85,
        cycleTime: 12,
        qualityScore: 94,
        satisfactionScore: 88,
      },
      status: 'healthy',
      lastUpdated: new Date(),
    },
    {
      id: '2',
      name: 'Beta Team',
      lead: 'Mike Rodriguez',
      memberCount: 4,
      healthScore: 76,
      trend: -8.1,
      metrics: {
        throughput: 72,
        cycleTime: 18,
        qualityScore: 81,
        satisfactionScore: 70,
      },
      status: 'warning',
      lastUpdated: new Date(),
    },
    {
      id: '3',
      name: 'Gamma Force',
      lead: 'Alex Johnson',
      memberCount: 5,
      healthScore: 84,
      trend: 2.3,
      metrics: {
        throughput: 78,
        cycleTime: 15,
        qualityScore: 89,
        satisfactionScore: 82,
      },
      status: 'healthy',
      lastUpdated: new Date(),
    },
    {
      id: '4',
      name: 'Delta Unit',
      lead: 'Emma Wilson',
      memberCount: 3,
      healthScore: 58,
      trend: -12.4,
      metrics: {
        throughput: 45,
        cycleTime: 28,
        qualityScore: 62,
        satisfactionScore: 55,
      },
      status: 'critical',
      lastUpdated: new Date(),
    },
  ],
  systemAverage: 77.5,
  alertCount: 2,
};

async function fetchPodHealth(): Promise<PodHealthOverview> {
  await new Promise(resolve => setTimeout(resolve, 400));
  return mockPodHealth;
}

function getHealthColor(score: number) {
  if (score >= 80) return 'text-green-600 bg-green-50';
  if (score >= 60) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
}

function getHealthStatus(score: number) {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'warning';
  return 'critical';
}

interface PodCardProps {
  pod: PodHealthData;
}

function PodCard({ pod }: PodCardProps) {
  const healthColor = getHealthColor(pod.healthScore);
  
  return (
    <div className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Users className="h-4 w-4 text-gray-500" />
          <h4 className="font-medium text-gray-900">{pod.name}</h4>
        </div>
        <Badge
          variant="secondary"
          className={cn('text-xs', healthColor)}
        >
          {pod.healthScore}
        </Badge>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Lead:</span>
          <span className="font-medium text-gray-900">{pod.lead}</span>
        </div>
        <div className="flex justify-between">
          <span>Members:</span>
          <span className="font-medium text-gray-900">{pod.memberCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Trend:</span>
          <div className={cn(
            'flex items-center text-xs font-medium',
            pod.trend >= 0 ? 'text-green-600' : 'text-red-600'
          )}>
            {pod.trend >= 0 ? (
              <TrendingUp className="h-3 w-3 mr-1" />
            ) : (
              <TrendingDown className="h-3 w-3 mr-1" />
            )}
            {Math.abs(pod.trend).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Health Score</span>
          <span>{pod.healthScore}/100</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={cn(
              'h-2 rounded-full transition-all duration-300',
              pod.healthScore >= 80 ? 'bg-green-500' :
              pod.healthScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{ width: `${pod.healthScore}%` }}
          />
        </div>
      </div>

      {/* Quick metrics */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500">Throughput:</span>
          <span className="ml-1 font-medium">{pod.metrics.throughput}</span>
        </div>
        <div>
          <span className="text-gray-500">Quality:</span>
          <span className="ml-1 font-medium">{pod.metrics.qualityScore}</span>
        </div>
      </div>
    </div>
  );
}

export function PodHealthScores() {
  const { data: healthData, isLoading, error } = useQuery({
    queryKey: ['podHealth'],
    queryFn: fetchPodHealth,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pod Health Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !healthData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pod Health Scores</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 text-center py-8">
            Failed to load pod health data
          </div>
        </CardContent>
      </Card>
    );
  }

  const sortedPods = [...healthData.pods].sort((a, b) => b.healthScore - a.healthScore);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Pod Health Scores</CardTitle>
          <div className="flex items-center space-x-2">
            {healthData.alertCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                {healthData.alertCount} alerts
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              Avg: {healthData.systemAverage.toFixed(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* System overview */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">System Average</span>
            <span className="text-lg font-bold text-gray-900">
              {healthData.systemAverage.toFixed(1)}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={cn(
                'h-3 rounded-full transition-all duration-300',
                healthData.systemAverage >= 80 ? 'bg-green-500' :
                healthData.systemAverage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${healthData.systemAverage}%` }}
            />
          </div>
        </div>

        {/* Pod list */}
        <div className="space-y-4">
          {sortedPods.map((pod) => (
            <PodCard key={pod.id} pod={pod} />
          ))}
        </div>

        {/* Quick actions */}
        <div className="mt-6 pt-4 border-t flex space-x-4">
          <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View All Pods →
          </button>
          <button className="text-sm text-gray-600 hover:text-gray-700">
            Health Report
          </button>
        </div>
      </CardContent>
    </Card>
  );
}