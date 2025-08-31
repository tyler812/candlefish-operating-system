'use client';

import React from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { MetricsOverview } from '@/components/dashboard/metrics-overview';
import { StageGateFunnel } from '@/components/dashboard/stage-gate-funnel';
import { WipLimitStatus } from '@/components/dashboard/wip-limit-status';
import { PodHealthScores } from '@/components/dashboard/pod-health-scores';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { SystemAlerts } from '@/components/dashboard/system-alerts';

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Dashboard</h1>
            <p className="text-gray-600">Real-time overview of the Candlefish Operating System v2.0</p>
          </div>
        </div>

        {/* Key Metrics */}
        <MetricsOverview />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stage Gate Funnel */}
          <div className="lg:col-span-2">
            <StageGateFunnel />
          </div>
          
          {/* WIP Limit Status */}
          <WipLimitStatus />
          
          {/* Pod Health Scores */}
          <PodHealthScores />
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-2">
            <RecentActivity />
          </div>
          
          {/* System Alerts */}
          <SystemAlerts />
        </div>
      </div>
    </DashboardLayout>
  );
}