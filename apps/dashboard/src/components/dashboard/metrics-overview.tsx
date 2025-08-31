'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Clock, 
  Target, 
  Users,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn, formatNumber, formatPercent } from '@/lib/utils';

interface SystemMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  averageCycleTime: number;
  throughput: number;
  qualityScore: number;
  wipUtilization: number;
  podHealthAverage: number;
  ideasInPipeline: number;
  decisionsActive: number;
  trends: {
    projects: number;
    throughput: number;
    quality: number;
    health: number;
  };
}

// Mock data for development
const mockMetrics: SystemMetrics = {
  totalProjects: 47,
  activeProjects: 23,
  completedProjects: 24,
  averageCycleTime: 14.5,
  throughput: 3.2,
  qualityScore: 87.5,
  wipUtilization: 72,
  podHealthAverage: 84.2,
  ideasInPipeline: 156,
  decisionsActive: 8,
  trends: {
    projects: 12.5,
    throughput: -3.2,
    quality: 8.7,
    health: 2.4,
  },
};

async function fetchSystemMetrics(): Promise<SystemMetrics> {
  // In a real app, this would be an API call
  await new Promise(resolve => setTimeout(resolve, 500));
  return mockMetrics;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ElementType;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  format?: 'number' | 'percent' | 'days';
}

function MetricCard({ 
  title, 
  value, 
  change, 
  changeLabel, 
  icon: Icon, 
  color = 'blue',
  format = 'number' 
}: MetricCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'string') return val;
    
    switch (format) {
      case 'percent':
        return formatPercent(val / 100);
      case 'days':
        return `${val} days`;
      default:
        return formatNumber(val);
    }
  };

  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    yellow: 'text-yellow-600 bg-yellow-50',
    red: 'text-red-600 bg-red-50',
    purple: 'text-purple-600 bg-purple-50',
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn('p-2 rounded-lg', colorClasses[color])}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600">{title}</p>
              <p className="text-2xl font-bold text-gray-900">{formatValue(value)}</p>
            </div>
          </div>
          
          {change !== undefined && (
            <div className="text-right">
              <div className={cn(
                'flex items-center text-sm font-medium',
                change >= 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {change >= 0 ? (
                  <TrendingUp className="h-4 w-4 mr-1" />
                ) : (
                  <TrendingDown className="h-4 w-4 mr-1" />
                )}
                {Math.abs(change)}%
              </div>
              {changeLabel && (
                <p className="text-xs text-gray-500 mt-1">{changeLabel}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricsOverview() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['systemMetrics'],
    queryFn: fetchSystemMetrics,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-gray-200 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded mb-2" />
                  <div className="h-6 bg-gray-200 rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="flex items-center justify-center p-6 text-red-600">
        <AlertTriangle className="h-5 w-5 mr-2" />
        Failed to load system metrics
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      <MetricCard
        title="Active Projects"
        value={metrics.activeProjects}
        change={metrics.trends.projects}
        changeLabel="vs last month"
        icon={Activity}
        color="blue"
      />
      
      <MetricCard
        title="Throughput"
        value={metrics.throughput}
        change={metrics.trends.throughput}
        changeLabel="projects/week"
        icon={Target}
        color="green"
      />
      
      <MetricCard
        title="Avg Cycle Time"
        value={metrics.averageCycleTime}
        icon={Clock}
        color="yellow"
        format="days"
      />
      
      <MetricCard
        title="Quality Score"
        value={metrics.qualityScore}
        change={metrics.trends.quality}
        changeLabel="overall quality"
        icon={CheckCircle}
        color="green"
        format="percent"
      />
      
      <MetricCard
        title="Pod Health"
        value={metrics.podHealthAverage}
        change={metrics.trends.health}
        changeLabel="average score"
        icon={Users}
        color="purple"
        format="percent"
      />
    </div>
  );
}