export interface CLOSProject {
  id: string;
  name: string;
  stage: 'idea' | 'prototype' | 'mvp' | 'scale' | 'sunset';
  owner: string;
  pod: string;
  wipLimit: number;
  currentWIP: number;
  blockers: string[];
  lastUpdated: Date;
}

export interface CLOSIdea {
  id: string;
  title: string;
  description: string;
  submitter: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'in-progress';
  estimatedEffort: number;
  potentialImpact: number;
  createdAt: Date;
}

export interface CLOSDecision {
  id: string;
  title: string;
  context: string;
  options: string[];
  recommendation: string;
  rationale: string;
  decisionMaker: string;
  stakeholders: string[];
  deadline?: Date;
  status: 'draft' | 'review' | 'approved' | 'implemented';
  createdAt: Date;
}

export interface CLOSMetrics {
  podName: string;
  wipUtilization: number;
  throughput: number;
  cycleTime: number;
  blockerCount: number;
  ideasSubmitted: number;
  decisionsApproved: number;
  demosSigned: number;
}

export interface CLOSUser {
  id: string;
  slackUserId: string;
  name: string;
  email: string;
  role: string;
  pod: string;
  preferences: {
    notifications: boolean;
    timezone: string;
  };
}

export interface SlackCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url: string;
  trigger_id: string;
}

export interface WebhookPayload {
  type: 'github' | 'calendar' | 'clos';
  event: string;
  data: any;
  timestamp: Date;
}

export interface NotificationConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'immediate';
  channel: string;
  enabled: boolean;
  schedule?: string;
}