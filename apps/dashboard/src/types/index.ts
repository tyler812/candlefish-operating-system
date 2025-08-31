// Core system types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  createdAt: Date;
  lastLoginAt?: Date;
}

export type UserRole = 'admin' | 'pod_lead' | 'member' | 'observer';

// Stage gate system
export interface StageGate {
  id: string;
  name: string;
  description: string;
  order: number;
  criteria: StageCriteria[];
  color: string;
}

export interface StageCriteria {
  id: string;
  name: string;
  description: string;
  required: boolean;
  weight: number;
}

// Pod system
export interface Pod {
  id: string;
  name: string;
  description: string;
  lead: User;
  members: User[];
  healthScore: number;
  status: PodStatus;
  wipLimits: WipLimits;
  currentWip: WipMetrics;
  metrics: PodMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export type PodStatus = 'active' | 'inactive' | 'archived';

export interface WipLimits {
  ideation: number;
  validation: number;
  development: number;
  testing: number;
  deployment: number;
}

export interface WipMetrics {
  ideation: number;
  validation: number;
  development: number;
  testing: number;
  deployment: number;
  total: number;
}

export interface PodMetrics {
  throughput: number;
  cycleTime: number;
  qualityScore: number;
  satisfactionScore: number;
  burndown: number;
}

// Project system
export interface Project {
  id: string;
  name: string;
  description: string;
  pod: Pod;
  stage: string;
  status: ProjectStatus;
  priority: Priority;
  assignees: User[];
  progress: number;
  startDate: Date;
  dueDate?: Date;
  completedAt?: Date;
  tags: string[];
  metrics: ProjectMetrics;
  risks: Risk[];
  dependencies: Dependency[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled' | 'blocked';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface ProjectMetrics {
  velocity: number;
  burndown: number;
  qualityGate: number;
  testCoverage: number;
  defectRate: number;
}

export interface Risk {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  likelihood: 'low' | 'medium' | 'high';
  mitigation: string;
  owner: User;
  status: 'open' | 'mitigated' | 'closed';
  createdAt: Date;
}

export interface Dependency {
  id: string;
  title: string;
  description: string;
  type: 'internal' | 'external';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  dependentProject: Project;
  blockedBy?: string;
  expectedDate?: Date;
  actualDate?: Date;
}

// Idea ledger system
export interface Idea {
  id: string;
  title: string;
  description: string;
  submitter: User;
  category: string;
  stage: string;
  priority: Priority;
  effort: EffortEstimate;
  impact: ImpactEstimate;
  score: number;
  tags: string[];
  assignedPod?: Pod;
  status: IdeaStatus;
  feedback: Feedback[];
  votes: Vote[];
  attachments: Attachment[];
  createdAt: Date;
  updatedAt: Date;
}

export type IdeaStatus = 
  | 'submitted' 
  | 'under_review' 
  | 'approved' 
  | 'in_development' 
  | 'implemented' 
  | 'rejected';

export type EffortEstimate = 'xs' | 'small' | 'medium' | 'large' | 'xl';
export type ImpactEstimate = 'low' | 'medium' | 'high' | 'game_changer';

export interface Feedback {
  id: string;
  user: User;
  comment: string;
  type: 'comment' | 'suggestion' | 'concern';
  createdAt: Date;
}

export interface Vote {
  id: string;
  user: User;
  type: 'up' | 'down';
  createdAt: Date;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedBy: User;
  createdAt: Date;
}

// Decision memo system
export interface DecisionMemo {
  id: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  consequences: string[];
  alternatives: Alternative[];
  stakeholders: User[];
  status: DecisionStatus;
  decisionDate?: Date;
  reviewDate?: Date;
  author: User;
  approvers: User[];
  tags: string[];
  relatedProjects: Project[];
  createdAt: Date;
  updatedAt: Date;
}

export type DecisionStatus = 
  | 'draft' 
  | 'under_review' 
  | 'approved' 
  | 'implemented' 
  | 'superseded';

export interface Alternative {
  id: string;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  effort: EffortEstimate;
  risk: 'low' | 'medium' | 'high';
}

// Analytics and metrics
export interface SystemMetrics {
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
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface ChartData {
  name: string;
  value: number;
  color?: string;
  data?: TimeSeriesData[];
}

// Real-time system
export interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  user: User;
  entityId: string;
  entityType: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export type ActivityType = 
  | 'project_created'
  | 'project_updated' 
  | 'project_completed'
  | 'idea_submitted'
  | 'idea_approved'
  | 'decision_created'
  | 'decision_approved'
  | 'pod_health_changed'
  | 'wip_limit_exceeded'
  | 'user_joined'
  | 'user_left';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  userId: string;
  createdAt: Date;
  expiresAt?: Date;
}

export type NotificationType = 
  | 'wip_violation'
  | 'deadline_approaching'
  | 'quality_threshold'
  | 'pod_health_alert'
  | 'decision_required'
  | 'idea_feedback'
  | 'project_blocked'
  | 'system_update';

// API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter and search
export interface FilterOptions {
  status?: string[];
  priority?: Priority[];
  pods?: string[];
  users?: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
}

export interface SearchOptions {
  query?: string;
  filters?: FilterOptions;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  pagination?: {
    page: number;
    limit: number;
  };
}

// WebSocket events
export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp: Date;
  userId?: string;
}

export interface SystemStatus {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    api: ComponentStatus;
    database: ComponentStatus;
    websocket: ComponentStatus;
    auth: ComponentStatus;
  };
  lastChecked: Date;
}

export interface ComponentStatus {
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  responseTime?: number;
  uptime?: number;
  errorRate?: number;
  message?: string;
}