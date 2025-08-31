'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StageData {
  id: string;
  name: string;
  count: number;
  capacity: number;
  color: string;
  projects: Array<{
    id: string;
    name: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  }>;
}

interface FunnelData {
  stages: StageData[];
  totalProjects: number;
  conversionRates: number[];
}

// Mock data for development
const mockFunnelData: FunnelData = {
  stages: [
    {
      id: 'ideation',
      name: 'Ideation',
      count: 45,
      capacity: 50,
      color: 'bg-purple-500',
      projects: [
        { id: '1', name: 'AI Content Generator', priority: 'high' },
        { id: '2', name: 'Mobile App Redesign', priority: 'medium' },
        { id: '3', name: 'Analytics Dashboard v2', priority: 'urgent' },
      ],
    },
    {
      id: 'validation',
      name: 'Validation',
      count: 23,
      capacity: 30,
      color: 'bg-cyan-500',
      projects: [
        { id: '4', name: 'Customer Portal', priority: 'high' },
        { id: '5', name: 'API Gateway', priority: 'medium' },
      ],
    },
    {
      id: 'development',
      name: 'Development',
      count: 18,
      capacity: 25,
      color: 'bg-green-500',
      projects: [
        { id: '6', name: 'Payment System', priority: 'urgent' },
        { id: '7', name: 'User Management', priority: 'high' },
      ],
    },
    {
      id: 'testing',
      name: 'Testing',
      count: 12,
      capacity: 15,
      color: 'bg-yellow-500',
      projects: [
        { id: '8', name: 'Security Audit Tool', priority: 'high' },
      ],
    },
    {
      id: 'deployment',
      name: 'Deployment',
      count: 8,
      capacity: 10,
      color: 'bg-red-500',
      projects: [
        { id: '9', name: 'Monitoring System', priority: 'medium' },
      ],
    },
  ],
  totalProjects: 106,
  conversionRates: [51.1, 78.3, 66.7, 66.7],
};

async function fetchFunnelData(): Promise<FunnelData> {
  await new Promise(resolve => setTimeout(resolve, 300));
  return mockFunnelData;
}

function getPriorityColor(priority: string) {
  const colors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-blue-100 text-blue-800',
    high: 'bg-orange-100 text-orange-800',
    urgent: 'bg-red-100 text-red-800',
  };
  return colors[priority as keyof typeof colors] || colors.medium;
}

interface StageCardProps {
  stage: StageData;
  conversionRate?: number;
}

function StageCard({ stage, conversionRate }: StageCardProps) {
  const utilization = (stage.count / stage.capacity) * 100;
  const isOverCapacity = stage.count > stage.capacity;

  return (
    <div className="relative">
      <Card className={cn(
        'transition-all duration-200 hover:shadow-md',
        isOverCapacity && 'ring-2 ring-red-200 bg-red-50'
      )}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className={cn('w-3 h-3 rounded-full', stage.color)} />
              <CardTitle className="text-lg">{stage.name}</CardTitle>
            </div>
            {isOverCapacity && (
              <Badge variant="destructive" className="text-xs">
                Over Capacity
              </Badge>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Capacity utilization */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600">Utilization</span>
              <span className={cn(
                'font-medium',
                isOverCapacity ? 'text-red-600' : 'text-gray-900'
              )}>
                {stage.count}/{stage.capacity} ({Math.round(utilization)}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  isOverCapacity ? 'bg-red-500' : stage.color
                )}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              />
            </div>
          </div>

          {/* Conversion rate */}
          {conversionRate !== undefined && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Conversion Rate</span>
              <span className="font-medium text-gray-900">
                {conversionRate.toFixed(1)}%
              </span>
            </div>
          )}

          {/* Sample projects */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Recent Projects
            </h4>
            <div className="space-y-2">
              {stage.projects.slice(0, 3).map((project) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                >
                  <span className="truncate flex-1 mr-2">{project.name}</span>
                  <Badge
                    variant="secondary"
                    className={cn('text-xs', getPriorityColor(project.priority))}
                  >
                    {project.priority}
                  </Badge>
                </div>
              ))}
              {stage.projects.length > 3 && (
                <div className="text-xs text-gray-500 text-center pt-1">
                  +{stage.projects.length - 3} more
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Funnel arrow */}
      {conversionRate !== undefined && (
        <div className="hidden lg:block absolute -right-4 top-1/2 transform -translate-y-1/2 z-10">
          <div className="flex flex-col items-center">
            <div className="w-0 h-0 border-t-4 border-b-4 border-l-8 border-transparent border-l-gray-400" />
            <div className="text-xs text-gray-500 mt-1 whitespace-nowrap">
              {conversionRate.toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StageGateFunnel() {
  const { data: funnelData, isLoading, error } = useQuery({
    queryKey: ['stageGateFunnel'],
    queryFn: fetchFunnelData,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stage Gate Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-64 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !funnelData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Stage Gate Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-600 text-center py-8">
            Failed to load funnel data
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Stage Gate Funnel</CardTitle>
          <div className="text-sm text-gray-600">
            {funnelData.totalProjects} total projects
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 lg:gap-8">
          {funnelData.stages.map((stage, index) => (
            <StageCard
              key={stage.id}
              stage={stage}
              conversionRate={funnelData.conversionRates[index]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}