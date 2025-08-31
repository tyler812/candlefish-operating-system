# Candlefish Operating System v2.0 - Technical Architecture
## From Documentation to Real Infrastructure

---

## Executive Summary

The current CLOS v1.0 is essentially a documentation framework with broken gist links and no actual automation. This architecture defines CLOS v2.0 as a **real operating system** with working infrastructure, automated workflows, and enforceable constraints.

**Key Transformation:**
- FROM: Markdown files and manual processes
- TO: Automated infrastructure with real-time enforcement

---

## Core Architecture Components

### 1. Infrastructure Foundation

#### 1.1 AWS Core Services
```yaml
Production Stack:
  Control Plane:
    - Service: AWS ECS Fargate
    - Purpose: Host CLOS Core API and services
    - Region: us-east-1 (primary), us-west-2 (failover)
  
  Data Layer:
    - Service: AWS RDS PostgreSQL
    - Purpose: Operational data, metrics, audit logs
    - Service: AWS DynamoDB
    - Purpose: Real-time state, WIP tracking, locks
    
  Event Bus:
    - Service: AWS EventBridge
    - Purpose: System-wide event routing
    - Integration: GitHub, Slack, Linear, custom webhooks
    
  Queue System:
    - Service: AWS SQS + Lambda
    - Purpose: Async processing, workflow orchestration
    
  Storage:
    - Service: AWS S3
    - Purpose: Artifact storage, logs, backups
```

#### 1.2 Edge & CDN
```yaml
Vercel Platform:
  Dashboard:
    - URL: dashboard.clos.candlefish.ai
    - Stack: Next.js 14, React Query, Tailwind
    - Features: Real-time metrics, pod status, WIP limits
    
  API Gateway:
    - URL: api.clos.candlefish.ai
    - Stack: Vercel Edge Functions
    - Purpose: GraphQL gateway, rate limiting
    
  Documentation:
    - URL: docs.clos.candlefish.ai
    - Stack: Nextra or Docusaurus
    - Auto-generated from code + manual guides
```

### 2. Core Services Architecture

#### 2.1 CLOS Core API
```typescript
// Primary service running on ECS
interface CLOSCoreAPI {
  // Stage Gate Management
  stages: {
    evaluate(projectId: string, stage: StageType): StageEvaluation
    advance(projectId: string, evidence: Evidence): StageTransition
    block(projectId: string, reason: BlockReason): void
  }
  
  // WIP Limit Enforcement
  wip: {
    checkLimit(podId: string, itemType: WIPType): boolean
    acquire(podId: string, itemId: string): WIPLock
    release(lockId: string): void
    getStatus(podId: string): WIPStatus
  }
  
  // Idea Ledger
  ideas: {
    submit(idea: IdeaInput): Idea
    evaluate(ideaId: string, criteria: EvalCriteria): Evaluation
    promote(ideaId: string): Project
    archive(ideaId: string, reason: string): void
  }
  
  // Pod Operations
  pods: {
    register(pod: PodConfig): Pod
    updateHealth(podId: string, metrics: HealthMetrics): void
    getStatus(podId: string): PodStatus
    rotate(podId: string, member: Member): void
  }
}
```

#### 2.2 Workflow Engine
```yaml
Temporal.io Cluster:
  Workflows:
    - ProjectLifecycle: Inception → Shipping
    - DailyRhythm: Unblock → Commit → Recap
    - WeeklyDemo: Collect → Present → Feedback
    - Deployment: Build → Test → Stage → Prod
    
  Activities:
    - GitHub: Create PR, merge, deploy
    - Slack: Notify, collect feedback
    - Linear: Create issue, update status
    - AWS: Deploy, scale, monitor
```

#### 2.3 Event Processing System
```typescript
// EventBridge + Lambda architecture
interface EventSystem {
  // GitHub Events
  onPullRequest: (event: PREvent) => Promise<void>
  onMerge: (event: MergeEvent) => Promise<void>
  onDeployment: (event: DeployEvent) => Promise<void>
  
  // Time-based Events
  onDailyUnblock: () => Promise<void>
  onWeeklyDemo: () => Promise<void>
  onMonthlyRotation: () => Promise<void>
  
  // Business Events
  onStageGate: (event: StageGateEvent) => Promise<void>
  onWIPLimitReached: (event: WIPLimitEvent) => Promise<void>
  onIdeaSubmitted: (event: IdeaEvent) => Promise<void>
}
```

### 3. Automation & Workflows

#### 3.1 GitHub Actions Workflows
```yaml
# .github/workflows/clos-stage-gates.yml
name: CLOS Stage Gates
on:
  pull_request:
    types: [opened, synchronize]
  
jobs:
  check-stage:
    runs-on: ubuntu-latest
    steps:
      - uses: candlefish/clos-action@v2
        with:
          stage: ${{ github.event.pull_request.labels }}
          project-id: ${{ github.event.repository.name }}
          
      - name: Validate Evidence
        run: |
          clos validate \
            --stage current \
            --evidence ./evidence.json
            
      - name: Check WIP Limits
        run: |
          clos wip check \
            --pod ${{ env.POD_ID }} \
            --type pull-request
            
      - name: Update Dashboard
        run: |
          clos dashboard update \
            --project ${{ github.event.repository.name }} \
            --status ${{ steps.validate.outputs.status }}
```

#### 3.2 Slack Integration
```typescript
// Slack App with Block Kit UI
const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Daily Unblock Command
slackApp.command('/unblock', async ({ command, ack, respond }) => {
  await ack();
  
  const blocks = await clos.getDailyUnblockBlocks(command.user_id);
  await respond({ blocks });
});

// WIP Limit Notifications
slackApp.event('app_mention', async ({ event, say }) => {
  if (event.text.includes('wip')) {
    const status = await clos.getWIPStatus(event.channel);
    await say({
      blocks: formatWIPStatus(status)
    });
  }
});
```

### 4. Data Architecture

#### 4.1 PostgreSQL Schema
```sql
-- Core operational tables
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  pod_id UUID REFERENCES pods(id),
  current_stage stage_type NOT NULL,
  wip_lock_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stage_transitions (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  from_stage stage_type,
  to_stage stage_type NOT NULL,
  evidence JSONB NOT NULL,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE wip_locks (
  id UUID PRIMARY KEY,
  pod_id UUID REFERENCES pods(id),
  item_type wip_type NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  acquired_by UUID REFERENCES users(id),
  acquired_at TIMESTAMP DEFAULT NOW(),
  released_at TIMESTAMP
);

CREATE TABLE ideas (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  submitted_by UUID REFERENCES users(id),
  evaluation_score DECIMAL(3,2),
  status idea_status DEFAULT 'pending',
  promoted_to_project_id UUID REFERENCES projects(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4.2 DynamoDB Tables
```yaml
Tables:
  RealTimeMetrics:
    PartitionKey: pod_id
    SortKey: timestamp
    Attributes:
      - active_wip: Number
      - velocity: Number
      - health_score: Number
    TTL: 30 days
    
  UserSessions:
    PartitionKey: user_id
    SortKey: session_id
    Attributes:
      - current_view: String
      - last_activity: Timestamp
    TTL: 24 hours
    
  EventStream:
    PartitionKey: event_type
    SortKey: timestamp
    Attributes:
      - payload: Map
      - processed: Boolean
    Stream: Enabled
```

### 5. Monitoring & Observability

#### 5.1 Datadog Integration
```yaml
Monitoring Stack:
  APM:
    - Service: clos-core-api
    - Service: clos-workflow-engine
    - Service: clos-dashboard
    
  Metrics:
    - wip.current_count
    - stage_gate.transitions
    - idea.submission_rate
    - pod.health_score
    - deployment.success_rate
    
  Dashboards:
    - Executive: High-level system health
    - Pod Performance: Per-pod metrics
    - Stage Gate Flow: Funnel analysis
    - WIP Limits: Real-time enforcement
    
  Alerts:
    - WIP limit exceeded
    - Stage gate blocked > 24h
    - Pod health score < 70%
    - Deployment failure rate > 10%
```

#### 5.2 Custom Dashboards
```typescript
// Real-time dashboard using Server-Sent Events
interface DashboardAPI {
  // Live metrics stream
  streamMetrics(): EventSource<MetricUpdate>
  
  // Pod status
  getPodStatus(podId: string): PodDashboard
  
  // Project funnel
  getProjectFunnel(): FunnelMetrics
  
  // WIP visualization
  getWIPHeatmap(): WIPHeatmap
  
  // Idea pipeline
  getIdeaPipeline(): IdeaMetrics
}
```

### 6. Security & Compliance

#### 6.1 Authentication & Authorization
```yaml
Auth0 Configuration:
  Tenant: candlefish-prod
  
  Applications:
    - CLOS Dashboard (SPA)
    - CLOS API (M2M)
    - GitHub Actions (M2M)
    - Slack Bot (M2M)
    
  Roles:
    - admin: Full system access
    - pod-lead: Pod management
    - developer: Standard access
    - viewer: Read-only access
    
  Rules:
    - MFA required for admin
    - IP allowlist for M2M
    - Session timeout: 8 hours
```

#### 6.2 Audit & Compliance
```typescript
interface AuditSystem {
  // Log all state changes
  logStateChange(change: StateChange): Promise<void>
  
  // Track all decisions
  logDecision(decision: Decision): Promise<void>
  
  // Compliance reports
  generateSOC2Report(): Promise<Report>
  generateAccessReport(): Promise<Report>
}
```

### 7. Implementation Phases

#### Phase 1: Core Infrastructure (Week 1-2)
```yaml
Deliverables:
  - AWS infrastructure via Terraform
  - Core API on ECS
  - PostgreSQL + DynamoDB setup
  - Basic GitHub Actions
  - Minimal dashboard on Vercel
  
Validation:
  - API health checks passing
  - Database migrations complete
  - GitHub webhook receiving events
  - Dashboard showing basic metrics
```

#### Phase 2: Workflow Automation (Week 3-4)
```yaml
Deliverables:
  - Temporal cluster setup
  - Stage gate workflows
  - WIP limit enforcement
  - Slack bot integration
  - Daily rhythm automation
  
Validation:
  - Stage gates blocking/approving PRs
  - WIP limits preventing new work
  - Slack commands working
  - Daily unblock notifications sent
```

#### Phase 3: Advanced Features (Week 5-6)
```yaml
Deliverables:
  - Full dashboard with real-time updates
  - Idea ledger with evaluation
  - Pod rotation system
  - Advanced analytics
  - Mobile app (React Native)
  
Validation:
  - Ideas flowing through pipeline
  - Pod metrics accurate
  - Analytics showing insights
  - Mobile app in TestFlight
```

#### Phase 4: Production Hardening (Week 7-8)
```yaml
Deliverables:
  - Load testing & optimization
  - Disaster recovery setup
  - Security audit & fixes
  - Documentation complete
  - Training materials
  
Validation:
  - 99.9% uptime SLA met
  - < 100ms API response time
  - Security scan passing
  - Team onboarded
```

### 8. Cost Estimation

```yaml
Monthly Infrastructure Costs:
  AWS:
    - ECS Fargate: $200 (2 services, 2 tasks each)
    - RDS PostgreSQL: $150 (db.t3.medium, Multi-AZ)
    - DynamoDB: $50 (on-demand pricing)
    - EventBridge: $20 (1M events)
    - Lambda: $30 (execution time)
    - S3: $10 (storage + transfer)
    
  Third-Party:
    - Vercel Pro: $20
    - Temporal Cloud: $200 (starter)
    - Datadog: $100 (5 hosts)
    - Auth0: $0 (free tier)
    
  Total: ~$780/month
  
Development Costs:
  - 8 weeks × 40 hours = 320 hours
  - At $150/hour = $48,000
  
Total First Year: ~$57,360
Ongoing Annual: ~$9,360
```

### 9. Success Metrics

```yaml
Technical Metrics:
  - API uptime: > 99.9%
  - Response time: < 100ms p95
  - Error rate: < 0.1%
  - Deployment frequency: Daily
  - MTTR: < 30 minutes
  
Business Metrics:
  - Stage gate cycle time: -50%
  - WIP limit violations: < 5/week
  - Ideas evaluated: > 10/week
  - Pod health score: > 80%
  - Team satisfaction: > 8/10
  
Adoption Metrics:
  - Daily active users: 100%
  - Slack command usage: > 50/day
  - Dashboard views: > 100/day
  - Workflow completion: > 95%
```

### 10. Migration Strategy

```yaml
Week 1: Foundation
  - Deploy core infrastructure
  - Migrate existing data
  - Setup basic monitoring
  
Week 2: Pilot Pod
  - Choose one pod (recommend: Ratio)
  - Implement full workflow
  - Gather feedback
  
Week 3-4: Rollout
  - Expand to all pods
  - Train team members
  - Refine based on feedback
  
Week 5+: Optimization
  - Performance tuning
  - Feature additions
  - Process refinement
```

---

## Appendix A: Technology Choices Rationale

### Why AWS + Vercel?
- **AWS**: Battle-tested, scalable, comprehensive services
- **Vercel**: Best-in-class Next.js hosting, edge functions, preview deployments

### Why Temporal?
- **Reliability**: Guaranteed workflow execution
- **Visibility**: Built-in workflow history and debugging
- **Flexibility**: Code-first workflows in TypeScript

### Why PostgreSQL + DynamoDB?
- **PostgreSQL**: ACID compliance for core data
- **DynamoDB**: Millisecond latency for real-time features

### Why Datadog?
- **Unified Platform**: APM, logs, metrics in one place
- **Integration**: Native AWS and Vercel support
- **Cost**: Predictable pricing model

---

## Appendix B: Quick Start Commands

```bash
# Deploy infrastructure
cd infrastructure/
terraform init
terraform plan -var-file=prod.tfvars
terraform apply

# Deploy core API
cd services/clos-core/
npm run build
npm run deploy:prod

# Deploy dashboard
cd apps/dashboard/
vercel --prod

# Setup Temporal
temporal cloud namespace create \
  --namespace candlefish-prod \
  --region us-east-1

# Initialize database
cd database/
npm run migrate:prod
npm run seed:prod

# Configure Slack
cd integrations/slack/
npm run setup:app
npm run deploy:prod

# Start monitoring
datadog-agent start
```

---

## Next Steps

1. **Approval**: Review and approve this architecture
2. **Team Assembly**: Identify implementation team
3. **Environment Setup**: Provision AWS accounts and services
4. **Sprint Planning**: Break down into 2-week sprints
5. **Kickoff**: Begin Phase 1 implementation

This is REAL infrastructure, not documentation. Every component will be built, deployed, and operational.