'use client';

import React from 'react';
import { useWebSocket } from '@/lib/websocket';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  X,
  ExternalLink,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { Notification } from '@/types';

function getAlertIcon(severity: string) {
  const icons = {
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
    success: CheckCircle,
  };
  return icons[severity as keyof typeof icons] || AlertTriangle;
}

function getAlertColor(severity: string) {
  const colors = {
    error: 'text-red-600 bg-red-50 border-red-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200',
    success: 'text-green-600 bg-green-50 border-green-200',
  };
  return colors[severity as keyof typeof colors] || colors.warning;
}

interface AlertItemProps {
  alert: Notification;
  onDismiss: (id: string) => void;
}

function AlertItem({ alert, onDismiss }: AlertItemProps) {
  const Icon = getAlertIcon(alert.severity);
  const colorClass = getAlertColor(alert.severity);

  return (
    <div className={cn('p-4 rounded-lg border', colorClass)}>
      <div className="flex items-start space-x-3">
        <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{alert.title}</h4>
            <div className="flex items-center space-x-2">
              <span className="text-xs opacity-75">
                {formatRelativeTime(alert.createdAt)}
              </span>
              <button
                onClick={() => onDismiss(alert.id)}
                className="opacity-75 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <p className="text-sm mt-1 opacity-90">
            {alert.message}
          </p>
          
          {alert.actionUrl && alert.actionLabel && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-current"
                onClick={() => window.open(alert.actionUrl, '_blank')}
              >
                {alert.actionLabel}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Mock alerts for development
const mockAlerts: Notification[] = [
  {
    id: 'alert-1',
    type: 'wip_violation',
    title: 'WIP Limit Exceeded',
    message: 'Testing stage has 16 items, exceeding the limit of 15',
    severity: 'warning',
    read: false,
    actionUrl: '/wip',
    actionLabel: 'View WIP Status',
    userId: 'system',
    createdAt: new Date(Date.now() - 1000 * 60 * 8), // 8 minutes ago
  },
  {
    id: 'alert-2',
    type: 'pod_health_alert',
    title: 'Pod Health Critical',
    message: 'Delta Unit health score has dropped below 60',
    severity: 'error',
    read: false,
    actionUrl: '/pods/delta-unit',
    actionLabel: 'View Pod Details',
    userId: 'system',
    createdAt: new Date(Date.now() - 1000 * 60 * 15), // 15 minutes ago
  },
  {
    id: 'alert-3',
    type: 'deadline_approaching',
    title: 'Project Deadline Approaching',
    message: 'Mobile App Redesign is due in 2 days',
    severity: 'info',
    read: false,
    actionUrl: '/projects/mobile-app-redesign',
    actionLabel: 'View Project',
    userId: 'system',
    createdAt: new Date(Date.now() - 1000 * 60 * 25), // 25 minutes ago
  },
  {
    id: 'alert-4',
    type: 'system_update',
    title: 'System Maintenance Scheduled',
    message: 'Planned maintenance window tonight from 2-4 AM EST',
    severity: 'info',
    read: false,
    userId: 'system',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
  },
];

export function SystemAlerts() {
  const { notifications, markNotificationRead } = useWebSocket();
  
  // Combine live notifications with mock data and filter for alerts
  const systemAlerts = [...notifications, ...mockAlerts]
    .filter(notification => 
      ['wip_violation', 'pod_health_alert', 'deadline_approaching', 'system_update', 'quality_threshold']
        .includes(notification.type)
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5); // Show last 5 alerts

  const handleDismiss = (alertId: string) => {
    markNotificationRead(alertId);
  };

  const alertCounts = {
    error: systemAlerts.filter(a => a.severity === 'error' && !a.read).length,
    warning: systemAlerts.filter(a => a.severity === 'warning' && !a.read).length,
    info: systemAlerts.filter(a => a.severity === 'info' && !a.read).length,
  };

  const totalAlerts = alertCounts.error + alertCounts.warning + alertCounts.info;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>System Alerts</CardTitle>
          <div className="flex items-center space-x-2">
            {alertCounts.error > 0 && (
              <Badge variant="destructive" className="text-xs">
                {alertCounts.error} critical
              </Badge>
            )}
            {alertCounts.warning > 0 && (
              <Badge variant="warning" className="text-xs">
                {alertCounts.warning} warnings
              </Badge>
            )}
            {totalAlerts === 0 && (
              <Badge variant="success" className="text-xs">
                All Clear
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {systemAlerts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
            <p className="font-medium text-green-600">System Running Smoothly</p>
            <p className="text-xs mt-1 text-gray-500">No active alerts or issues</p>
          </div>
        ) : (
          <div className="space-y-3">
            {systemAlerts.filter(alert => !alert.read).map((alert) => (
              <AlertItem 
                key={alert.id} 
                alert={alert} 
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}

        {/* Quick stats */}
        <div className="mt-6 pt-4 border-t">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-red-600">
                {alertCounts.error}
              </div>
              <div className="text-xs text-gray-500">Critical</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {alertCounts.warning}
              </div>
              <div className="text-xs text-gray-500">Warnings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {alertCounts.info}
              </div>
              <div className="text-xs text-gray-500">Info</div>
            </div>
          </div>
        </div>

        {/* View all alerts */}
        <div className="mt-4 text-center">
          <button className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View All Notifications →
          </button>
        </div>
      </CardContent>
    </Card>
  );
}