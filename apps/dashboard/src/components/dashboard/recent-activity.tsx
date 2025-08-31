'use client';

import React from 'react';
import { useWebSocket } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Activity,
  GitCommit,
  User,
  FileText,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { ActivityItem } from '@/types';

function getActivityIcon(type: string) {
  const icons = {
    project_created: GitCommit,
    project_updated: Activity,
    project_completed: CheckCircle,
    idea_submitted: Lightbulb,
    idea_approved: CheckCircle,
    decision_created: FileText,
    decision_approved: CheckCircle,
    pod_health_changed: Activity,
    wip_limit_exceeded: AlertTriangle,
    user_joined: User,
    user_left: User,
  };
  return icons[type as keyof typeof icons] || Activity;
}

function getActivityColor(type: string) {
  const colors = {
    project_created: 'text-blue-600 bg-blue-50',
    project_updated: 'text-yellow-600 bg-yellow-50',
    project_completed: 'text-green-600 bg-green-50',
    idea_submitted: 'text-purple-600 bg-purple-50',
    idea_approved: 'text-green-600 bg-green-50',
    decision_created: 'text-blue-600 bg-blue-50',
    decision_approved: 'text-green-600 bg-green-50',
    pod_health_changed: 'text-orange-600 bg-orange-50',
    wip_limit_exceeded: 'text-red-600 bg-red-50',
    user_joined: 'text-green-600 bg-green-50',
    user_left: 'text-gray-600 bg-gray-50',
  };
  return colors[type as keyof typeof colors] || 'text-gray-600 bg-gray-50';
}

interface ActivityItemProps {
  activity: ActivityItem;
}

function ActivityItemComponent({ activity }: ActivityItemProps) {
  const Icon = getActivityIcon(activity.type);
  const colorClass = getActivityColor(activity.type);

  return (
    <div className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
      <div className={cn('p-2 rounded-full', colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {activity.title}
          </h4>
          <div className="flex items-center text-xs text-gray-500 ml-2">
            <Clock className="h-3 w-3 mr-1" />
            {formatRelativeTime(activity.timestamp)}
          </div>
        </div>
        
        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
          {activity.description}
        </p>
        
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-gray-600">
                {activity.user.name.charAt(0)}
              </span>
            </div>
            <span className="text-xs text-gray-500">{activity.user.name}</span>
          </div>
          
          {activity.metadata?.priority && (
            <Badge
              variant="secondary"
              className="text-xs"
            >
              {activity.metadata.priority}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

// Mock activities for development
const mockActivities: ActivityItem[] = [
  {
    id: '1',
    type: 'project_completed',
    title: 'Payment System Deployed',
    description: 'Successfully deployed the new payment system to production',
    user: { id: '1', name: 'Sarah Chen', email: 'sarah@candlefish.ai', role: 'pod_lead' },
    entityId: 'project-1',
    entityType: 'project',
    timestamp: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
    metadata: { priority: 'high' },
  },
  {
    id: '2',
    type: 'wip_limit_exceeded',
    title: 'WIP Limit Exceeded in Testing',
    description: 'Testing stage has 16 items, exceeding the limit of 15',
    user: { id: '2', name: 'System', email: 'system@candlefish.ai', role: 'admin' },
    entityId: 'testing-stage',
    entityType: 'stage',
    timestamp: new Date(Date.now() - 1000 * 60 * 12), // 12 minutes ago
  },
  {
    id: '3',
    type: 'idea_submitted',
    title: 'New Idea: AI Code Review Assistant',
    description: 'Automated code review using AI to improve code quality',
    user: { id: '3', name: 'Mike Rodriguez', email: 'mike@candlefish.ai', role: 'member' },
    entityId: 'idea-123',
    entityType: 'idea',
    timestamp: new Date(Date.now() - 1000 * 60 * 18), // 18 minutes ago
  },
  {
    id: '4',
    type: 'decision_approved',
    title: 'Architecture Decision Approved',
    description: 'Microservices architecture decision memo has been approved',
    user: { id: '4', name: 'Alex Johnson', email: 'alex@candlefish.ai', role: 'pod_lead' },
    entityId: 'decision-456',
    entityType: 'decision',
    timestamp: new Date(Date.now() - 1000 * 60 * 32), // 32 minutes ago
  },
  {
    id: '5',
    type: 'pod_health_changed',
    title: 'Beta Team Health Score Updated',
    description: 'Health score dropped to 76 due to increased cycle time',
    user: { id: '2', name: 'System', email: 'system@candlefish.ai', role: 'admin' },
    entityId: 'pod-beta',
    entityType: 'pod',
    timestamp: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
    metadata: { previousScore: 82, newScore: 76 },
  },
];

export function RecentActivity() {
  const { activities: liveActivities } = useWebSocket();
  
  // Combine live activities with mock data for development
  const allActivities = [...liveActivities, ...mockActivities]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10); // Show last 10 activities

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">Live</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {allActivities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No recent activity</p>
            <p className="text-xs mt-1">Activity will appear here as it happens</p>
          </div>
        ) : (
          <div className="space-y-1">
            {allActivities.map((activity) => (
              <ActivityItemComponent key={activity.id} activity={activity} />
            ))}
          </div>
        )}
        
        {/* View all link */}
        <div className="mt-4 pt-4 border-t text-center">
          <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View All Activity →
          </button>
        </div>
      </CardContent>
    </Card>
  );
}