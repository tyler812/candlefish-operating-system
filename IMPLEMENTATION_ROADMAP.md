# CLOS v2.0 Implementation Roadmap
## From Architecture to Working System

---

## Week 1-2: Core Infrastructure Setup

### Day 1-2: AWS Infrastructure via Terraform

```hcl
# infrastructure/terraform/main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket = "candlefish-terraform-state"
    key    = "clos/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

# VPC and Networking
module "vpc" {
  source = "./modules/vpc"
  
  cidr_block = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
  
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24"]
  
  enable_nat_gateway = true
  enable_vpn_gateway = false
  
  tags = {
    Environment = "production"
    System      = "clos"
  }
}

# ECS Cluster for Core Services
resource "aws_ecs_cluster" "clos_cluster" {
  name = "clos-production"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
  
  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.clos_ecs.name
      }
    }
  }
}

# RDS PostgreSQL for Core Data
module "rds" {
  source = "./modules/rds"
  
  identifier = "clos-core-db"
  
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.t3.medium"
  
  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_encrypted     = true
  
  database_name = "clos"
  username      = "clos_admin"
  
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "sun:04:00-sun:05:00"
  
  multi_az = true
  
  tags = {
    Environment = "production"
    System      = "clos"
  }
}

# DynamoDB Tables for Real-time Data
resource "aws_dynamodb_table" "wip_locks" {
  name           = "clos-wip-locks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "pod_id"
  range_key      = "item_id"
  
  attribute {
    name = "pod_id"
    type = "S"
  }
  
  attribute {
    name = "item_id"
    type = "S"
  }
  
  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
  
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
  
  tags = {
    Environment = "production"
    System      = "clos"
  }
}

# EventBridge for System Events
resource "aws_cloudwatch_event_bus" "clos_events" {
  name = "clos-event-bus"
  
  tags = {
    Environment = "production"
    System      = "clos"
  }
}

# S3 Buckets for Artifacts
resource "aws_s3_bucket" "clos_artifacts" {
  bucket = "candlefish-clos-artifacts"
  
  tags = {
    Environment = "production"
    System      = "clos"
  }
}

resource "aws_s3_bucket_versioning" "clos_artifacts" {
  bucket = aws_s3_bucket.clos_artifacts.id
  
  versioning_configuration {
    status = "Enabled"
  }
}
```

### Day 3-4: Core API Service

```typescript
// services/clos-core/src/index.ts
import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSchema } from 'type-graphql';
import { Container } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';

// Initialize clients
const prisma = new PrismaClient();
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
const eventbridge = new EventBridgeClient({ region: 'us-east-1' });

// Service container setup
Container.set('prisma', prisma);
Container.set('dynamodb', dynamodb);
Container.set('eventbridge', eventbridge);

// GraphQL Resolvers
@Resolver()
class StageGateResolver {
  @Mutation(() => StageTransition)
  async evaluateStageGate(
    @Arg('projectId') projectId: string,
    @Arg('evidence') evidence: string
  ): Promise<StageTransition> {
    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Evaluate stage gate criteria
    const evaluation = await this.evaluateCriteria(
      project.currentStage,
      JSON.parse(evidence)
    );
    
    if (evaluation.passed) {
      // Advance to next stage
      const nextStage = this.getNextStage(project.currentStage);
      
      const transition = await prisma.stageTransition.create({
        data: {
          projectId,
          fromStage: project.currentStage,
          toStage: nextStage,
          evidence: JSON.parse(evidence),
          approvedBy: context.user.id,
        }
      });
      
      // Update project
      await prisma.project.update({
        where: { id: projectId },
        data: { currentStage: nextStage }
      });
      
      // Emit event
      await eventbridge.send(new PutEventsCommand({
        Entries: [{
          Source: 'clos.stagegate',
          DetailType: 'StageAdvanced',
          Detail: JSON.stringify({
            projectId,
            fromStage: project.currentStage,
            toStage: nextStage
          })
        }]
      }));
      
      return transition;
    } else {
      throw new Error(`Stage gate criteria not met: ${evaluation.reason}`);
    }
  }
  
  private async evaluateCriteria(stage: string, evidence: any): Promise<any> {
    // Stage-specific evaluation logic
    switch (stage) {
      case 'DISCOVERY':
        return {
          passed: evidence.customerInterviews >= 5 && 
                  evidence.problemValidation === true,
          reason: 'Need more customer validation'
        };
      
      case 'PROTOTYPE':
        return {
          passed: evidence.prototypeUrl && 
                  evidence.userTesting >= 3,
          reason: 'Prototype not tested'
        };
      
      case 'MINIMUM_REMARKABLE':
        return {
          passed: evidence.checklist.every(item => item.complete),
          reason: 'Checklist incomplete'
        };
      
      default:
        return { passed: false, reason: 'Unknown stage' };
    }
  }
}

@Resolver()
class WIPLimitResolver {
  @Query(() => WIPStatus)
  async getWIPStatus(@Arg('podId') podId: string): Promise<WIPStatus> {
    const response = await dynamodb.send(new QueryCommand({
      TableName: 'clos-wip-locks',
      KeyConditionExpression: 'pod_id = :podId',
      ExpressionAttributeValues: {
        ':podId': { S: podId }
      }
    }));
    
    const activeLocks = response.Items?.filter(item => 
      !item.released_at
    ) || [];
    
    const limits = await this.getWIPLimits(podId);
    
    return {
      podId,
      current: activeLocks.length,
      limit: limits.total,
      available: limits.total - activeLocks.length,
      locks: activeLocks.map(this.mapLock)
    };
  }
  
  @Mutation(() => WIPLock)
  async acquireWIPLock(
    @Arg('podId') podId: string,
    @Arg('itemId') itemId: string,
    @Arg('itemType') itemType: string
  ): Promise<WIPLock> {
    // Check current WIP
    const status = await this.getWIPStatus(podId);
    
    if (status.available <= 0) {
      throw new Error(`WIP limit reached for pod ${podId}`);
    }
    
    // Create lock
    const lock = {
      id: generateId(),
      podId,
      itemId,
      itemType,
      acquiredBy: context.user.id,
      acquiredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    await dynamodb.send(new PutItemCommand({
      TableName: 'clos-wip-locks',
      Item: marshall(lock)
    }));
    
    // Emit event
    await eventbridge.send(new PutEventsCommand({
      Entries: [{
        Source: 'clos.wip',
        DetailType: 'LockAcquired',
        Detail: JSON.stringify(lock)
      }]
    }));
    
    return lock;
  }
}

// Express app setup
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// GraphQL setup
async function startServer() {
  const schema = await buildSchema({
    resolvers: [StageGateResolver, WIPLimitResolver],
    container: Container
  });
  
  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      ApolloServerPluginLandingPageLocalDefault()
    ]
  });
  
  await server.start();
  
  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => ({
        user: await authenticateUser(req),
        dataSources: {
          prisma,
          dynamodb,
          eventbridge
        }
      })
    })
  );
  
  // WebSocket subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql'
  });
  
  useServer({ schema }, wsServer);
  
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`CLOS Core API running on port ${PORT}`);
  });
}

startServer().catch(console.error);
```

### Day 5: Database Schema & Migrations

```sql
-- database/migrations/001_initial_schema.sql

-- Enum types
CREATE TYPE stage_type AS ENUM (
  'IDEA',
  'DISCOVERY',
  'PROTOTYPE',
  'MINIMUM_REMARKABLE',
  'GROWTH',
  'OPTIMIZATION'
);

CREATE TYPE wip_type AS ENUM (
  'FEATURE',
  'BUG',
  'INVESTIGATION',
  'DEPLOYMENT'
);

CREATE TYPE idea_status AS ENUM (
  'PENDING',
  'EVALUATING',
  'APPROVED',
  'PROMOTED',
  'ARCHIVED'
);

-- Core tables
CREATE TABLE pods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  max_wip INTEGER DEFAULT 5,
  health_score DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  pod_id UUID REFERENCES pods(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  pod_id UUID REFERENCES pods(id),
  current_stage stage_type NOT NULL DEFAULT 'IDEA',
  wip_lock_id VARCHAR(100),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE stage_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  from_stage stage_type,
  to_stage stage_type NOT NULL,
  evidence JSONB NOT NULL,
  approved_by UUID REFERENCES users(id),
  blocked_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  problem_statement TEXT,
  proposed_solution TEXT,
  submitted_by UUID REFERENCES users(id),
  evaluation_score DECIMAL(3,2),
  evaluation_notes TEXT,
  status idea_status DEFAULT 'PENDING',
  promoted_to_project_id UUID REFERENCES projects(id),
  archived_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE daily_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  pod_id UUID REFERENCES pods(id),
  date DATE NOT NULL,
  blockers TEXT[],
  completed TEXT[],
  next_up TEXT[],
  help_needed TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE TABLE metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pod_id UUID REFERENCES pods(id),
  project_id UUID REFERENCES projects(id),
  metric_type VARCHAR(50) NOT NULL,
  metric_value DECIMAL(10,2) NOT NULL,
  metadata JSONB,
  recorded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_projects_pod ON projects(pod_id);
CREATE INDEX idx_projects_stage ON projects(current_stage);
CREATE INDEX idx_transitions_project ON stage_transitions(project_id);
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE INDEX idx_daily_updates_date ON daily_updates(date);
CREATE INDEX idx_metrics_pod_date ON metrics(pod_id, recorded_at);

-- Audit triggers
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pods_updated_at BEFORE UPDATE ON pods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ideas_updated_at BEFORE UPDATE ON ideas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Day 6-7: GitHub Actions Integration

```yaml
# .github/workflows/clos-integration.yml
name: CLOS Integration

on:
  pull_request:
    types: [opened, synchronize, labeled, unlabeled]
  issues:
    types: [opened, labeled]
  push:
    branches: [main]

jobs:
  check-wip-limit:
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request' && github.event.action == 'opened'
    steps:
      - name: Setup CLOS CLI
        run: |
          curl -sSL https://clos.candlefish.ai/install.sh | bash
          echo "$HOME/.clos/bin" >> $GITHUB_PATH
      
      - name: Authenticate
        run: |
          clos auth login \
            --token ${{ secrets.CLOS_API_TOKEN }} \
            --endpoint https://api.clos.candlefish.ai
      
      - name: Check WIP Limit
        id: wip_check
        run: |
          POD_ID=$(clos pod identify --repo ${{ github.repository }})
          
          WIP_STATUS=$(clos wip status --pod $POD_ID --format json)
          AVAILABLE=$(echo $WIP_STATUS | jq '.available')
          
          if [ $AVAILABLE -le 0 ]; then
            echo "::error::WIP limit reached for pod. Current WIP: $(echo $WIP_STATUS | jq '.current')/$(echo $WIP_STATUS | jq '.limit')"
            exit 1
          fi
          
          echo "wip_available=$AVAILABLE" >> $GITHUB_OUTPUT
      
      - name: Acquire WIP Lock
        if: success()
        run: |
          clos wip acquire \
            --pod ${{ steps.wip_check.outputs.pod_id }} \
            --item "pr-${{ github.event.pull_request.number }}" \
            --type pull_request
      
      - name: Comment on PR
        if: success()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `✅ WIP lock acquired. Available slots: ${{ steps.wip_check.outputs.wip_available }}`
            })

  evaluate-stage-gate:
    runs-on: ubuntu-latest
    if: contains(github.event.pull_request.labels.*.name, 'stage-gate')
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup CLOS CLI
        run: |
          curl -sSL https://clos.candlefish.ai/install.sh | bash
          echo "$HOME/.clos/bin" >> $GITHUB_PATH
      
      - name: Extract Stage Evidence
        id: evidence
        run: |
          # Look for evidence file
          if [ -f ".clos/evidence.json" ]; then
            EVIDENCE=$(cat .clos/evidence.json | jq -c .)
          else
            # Generate from PR data
            EVIDENCE=$(jq -n \
              --arg pr "${{ github.event.pull_request.number }}" \
              --arg title "${{ github.event.pull_request.title }}" \
              --arg body "${{ github.event.pull_request.body }}" \
              '{
                pull_request: $pr,
                title: $title,
                description: $body,
                tests_passing: true,
                documentation_updated: true
              }')
          fi
          
          echo "evidence=$EVIDENCE" >> $GITHUB_OUTPUT
      
      - name: Evaluate Stage Gate
        id: evaluate
        run: |
          PROJECT_ID=$(clos project identify --repo ${{ github.repository }})
          
          RESULT=$(clos stage evaluate \
            --project $PROJECT_ID \
            --evidence '${{ steps.evidence.outputs.evidence }}' \
            --format json)
          
          echo "passed=$(echo $RESULT | jq '.passed')" >> $GITHUB_OUTPUT
          echo "next_stage=$(echo $RESULT | jq -r '.next_stage')" >> $GITHUB_OUTPUT
          echo "feedback=$(echo $RESULT | jq -r '.feedback')" >> $GITHUB_OUTPUT
      
      - name: Update PR Status
        uses: actions/github-script@v7
        with:
          script: |
            const passed = ${{ steps.evaluate.outputs.passed }};
            const feedback = `${{ steps.evaluate.outputs.feedback }}`;
            
            if (passed) {
              await github.rest.pulls.merge({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.issue.number,
                commit_title: `Stage gate passed: Advancing to ${{ steps.evaluate.outputs.next_stage }}`,
                merge_method: 'squash'
              });
              
              await github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `✅ Stage gate **PASSED**\n\nAdvancing to: **${{ steps.evaluate.outputs.next_stage }}**\n\n${feedback}`
              });
            } else {
              await github.rest.issues.createComment({
                issue_number: context.issue.number,
                owner: context.repo.owner,
                repo: context.repo.repo,
                body: `❌ Stage gate **BLOCKED**\n\n${feedback}\n\nPlease address the feedback and update the evidence.`
              });
              
              await github.rest.pulls.update({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.issue.number,
                state: 'closed'
              });
            }

  process-idea-submission:
    runs-on: ubuntu-latest
    if: github.event_name == 'issues' && contains(github.event.issue.labels.*.name, 'idea')
    steps:
      - name: Parse Idea
        id: parse
        uses: actions/github-script@v7
        with:
          script: |
            const body = context.payload.issue.body;
            
            // Parse structured idea format
            const sections = body.split('###').reduce((acc, section) => {
              const [heading, ...content] = section.trim().split('\n');
              if (heading) {
                acc[heading.trim().toLowerCase().replace(/\s+/g, '_')] = content.join('\n').trim();
              }
              return acc;
            }, {});
            
            return {
              title: context.payload.issue.title,
              problem: sections.problem_statement || '',
              solution: sections.proposed_solution || '',
              impact: sections.expected_impact || '',
              effort: sections.estimated_effort || ''
            };
      
      - name: Submit to Idea Ledger
        run: |
          clos idea submit \
            --title "${{ fromJson(steps.parse.outputs.result).title }}" \
            --problem "${{ fromJson(steps.parse.outputs.result).problem }}" \
            --solution "${{ fromJson(steps.parse.outputs.result).solution }}" \
            --submitter "${{ github.event.issue.user.login }}"
      
      - name: Auto-evaluate
        id: evaluate
        run: |
          IDEA_ID=$(clos idea latest --submitter "${{ github.event.issue.user.login }}" --format id)
          
          SCORE=$(clos idea evaluate \
            --id $IDEA_ID \
            --auto \
            --format json | jq '.score')
          
          echo "score=$SCORE" >> $GITHUB_OUTPUT
          echo "idea_id=$IDEA_ID" >> $GITHUB_OUTPUT
      
      - name: Update Issue
        uses: actions/github-script@v7
        with:
          script: |
            const score = ${{ steps.evaluate.outputs.score }};
            const ideaId = '${{ steps.evaluate.outputs.idea_id }}';
            
            let label, message;
            if (score >= 8) {
              label = 'idea-approved';
              message = '🎉 Idea approved for development!';
            } else if (score >= 6) {
              label = 'idea-review';
              message = '👀 Idea needs review';
            } else {
              label = 'idea-needs-work';
              message = '💭 Idea needs refinement';
            }
            
            await github.rest.issues.addLabels({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              labels: [label]
            });
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `${message}\n\n**Evaluation Score:** ${score}/10\n**Idea ID:** ${ideaId}\n\n[View in dashboard](https://dashboard.clos.candlefish.ai/ideas/${ideaId})`
            });
```

### Day 8-10: Dashboard & Real-time Monitoring

```typescript
// apps/dashboard/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { Card, Grid, Metric, Text, ProgressBar } from '@tremor/react';
import { Line, Bar, Funnel } from '@ant-design/plots';

const SYSTEM_METRICS_QUERY = gql`
  query SystemMetrics {
    systemMetrics {
      pods {
        id
        name
        healthScore
        currentWIP
        maxWIP
        velocity
      }
      stageGates {
        stage
        inProgress
        blocked
        completed
      }
      ideas {
        pending
        evaluating
        approved
        promoted
      }
    }
  }
`;

const METRICS_SUBSCRIPTION = gql`
  subscription MetricsUpdate {
    metricsUpdated {
      type
      podId
      metric
      value
      timestamp
    }
  }
`;

export default function Dashboard() {
  const { data, loading } = useQuery(SYSTEM_METRICS_QUERY, {
    pollInterval: 5000
  });
  
  const { data: liveUpdate } = useSubscription(METRICS_SUBSCRIPTION);
  
  const [metrics, setMetrics] = useState({
    pods: [],
    stageGates: [],
    ideas: {}
  });
  
  useEffect(() => {
    if (data) {
      setMetrics(data.systemMetrics);
    }
  }, [data]);
  
  useEffect(() => {
    if (liveUpdate) {
      // Update specific metric in real-time
      setMetrics(prev => {
        const updated = { ...prev };
        // Apply live update logic
        return updated;
      });
    }
  }, [liveUpdate]);
  
  if (loading) return <LoadingState />;
  
  return (
    <div className="p-6 space-y-6">
      {/* System Health Overview */}
      <Card>
        <Text>System Health</Text>
        <Metric>
          {calculateOverallHealth(metrics.pods)}%
        </Metric>
        <ProgressBar value={calculateOverallHealth(metrics.pods)} className="mt-2" />
      </Card>
      
      {/* Pod Status Grid */}
      <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-6">
        {metrics.pods.map(pod => (
          <PodCard key={pod.id} pod={pod} />
        ))}
      </Grid>
      
      {/* Stage Gate Funnel */}
      <Card>
        <Text>Project Pipeline</Text>
        <Funnel
          data={formatStageGateData(metrics.stageGates)}
          xField="stage"
          yField="count"
          legend={false}
          conversionTag={{
            formatter: (datum) => `${datum.conversionRate}%`
          }}
        />
      </Card>
      
      {/* Real-time Activity Feed */}
      <Card>
        <Text>Live Activity</Text>
        <ActivityFeed />
      </Card>
    </div>
  );
}

function PodCard({ pod }) {
  const wipPercentage = (pod.currentWIP / pod.maxWIP) * 100;
  const wipColor = wipPercentage > 80 ? 'red' : wipPercentage > 60 ? 'yellow' : 'green';
  
  return (
    <Card>
      <div className="flex justify-between">
        <Text>{pod.name}</Text>
        <HealthBadge score={pod.healthScore} />
      </div>
      
      <Metric className="mt-2">
        {pod.currentWIP}/{pod.maxWIP}
      </Metric>
      <Text>WIP Items</Text>
      
      <ProgressBar
        value={wipPercentage}
        color={wipColor}
        className="mt-2"
      />
      
      <div className="mt-4 flex justify-between text-sm">
        <Text>Velocity</Text>
        <Text className="font-medium">{pod.velocity} items/week</Text>
      </div>
    </Card>
  );
}

function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  
  useEffect(() => {
    const eventSource = new EventSource('https://api.clos.candlefish.ai/events');
    
    eventSource.onmessage = (event) => {
      const activity = JSON.parse(event.data);
      setActivities(prev => [activity, ...prev].slice(0, 10));
    };
    
    return () => eventSource.close();
  }, []);
  
  return (
    <div className="space-y-2 mt-4">
      {activities.map((activity, idx) => (
        <ActivityItem key={idx} activity={activity} />
      ))}
    </div>
  );
}
```

---

## Week 3-4: Workflow Automation

### Temporal Workflow Implementation

```typescript
// workflows/src/workflows/project-lifecycle.ts
import { proxyActivities, sleep, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities';

const { 
  createGitHubIssue,
  sendSlackNotification,
  updateLinearTicket,
  evaluateStageGate,
  deployToEnvironment
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '1 second',
    maximumInterval: '1 minute',
    maximumAttempts: 3
  }
});

export const expediteSignal = defineSignal('expedite');
export const blockSignal = defineSignal<[string]>('block');

export async function projectLifecycle(input: ProjectInput): Promise<ProjectResult> {
  let currentStage: Stage = 'IDEA';
  let isBlocked = false;
  let blockReason = '';
  let isExpedited = false;
  
  // Signal handlers
  setHandler(expediteSignal, () => {
    isExpedited = true;
  });
  
  setHandler(blockSignal, (reason: string) => {
    isBlocked = true;
    blockReason = reason;
  });
  
  // Stage 1: Idea Validation
  await sendSlackNotification({
    channel: input.podChannel,
    message: `New project started: ${input.name}`
  });
  
  const ideaValidation = await evaluateIdea(input.ideaId);
  if (ideaValidation.score < 6) {
    return {
      status: 'REJECTED',
      reason: 'Idea score too low',
      stage: currentStage
    };
  }
  
  // Stage 2: Discovery
  currentStage = 'DISCOVERY';
  
  const githubIssue = await createGitHubIssue({
    repo: input.repository,
    title: `Discovery: ${input.name}`,
    labels: ['discovery', 'pod:' + input.podId]
  });
  
  // Wait for discovery completion (max 2 weeks unless expedited)
  const discoveryDeadline = isExpedited ? '3 days' : '14 days';
  await sleep(discoveryDeadline);
  
  if (isBlocked) {
    await handleBlockedState(currentStage, blockReason);
    return {
      status: 'BLOCKED',
      reason: blockReason,
      stage: currentStage
    };
  }
  
  // Evaluate discovery stage gate
  const discoveryGate = await evaluateStageGate({
    projectId: input.projectId,
    stage: 'DISCOVERY',
    evidence: await gatherEvidence('DISCOVERY')
  });
  
  if (!discoveryGate.passed) {
    return {
      status: 'STAGE_GATE_FAILED',
      reason: discoveryGate.feedback,
      stage: currentStage
    };
  }
  
  // Stage 3: Prototype
  currentStage = 'PROTOTYPE';
  
  await updateLinearTicket({
    ticketId: input.linearTicketId,
    status: 'IN_PROGRESS',
    labels: ['prototype']
  });
  
  // Deploy to staging
  const stagingDeployment = await deployToEnvironment({
    environment: 'staging',
    projectId: input.projectId,
    version: 'prototype-' + Date.now()
  });
  
  // Continue through remaining stages...
  
  return {
    status: 'COMPLETED',
    stage: 'SHIPPED',
    deploymentUrl: stagingDeployment.url
  };
}

// Daily rhythm workflow
export async function dailyRhythm(podId: string): Promise<void> {
  // Morning unblock
  await sendSlackNotification({
    channel: getPodChannel(podId),
    message: 'Good morning! Time for daily unblock.',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Daily Unblock Questions:*\n• What did you complete yesterday?\n• What are you working on today?\n• Any blockers?'
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Submit Update' },
            action_id: 'submit_daily_update'
          }
        ]
      }
    ]
  });
  
  // Wait for responses (timeout after 30 minutes)
  await sleep('30 minutes');
  
  // Aggregate and post summary
  const updates = await collectDailyUpdates(podId);
  await postDailySummary(podId, updates);
  
  // Evening commit reminder
  await sleep('8 hours');
  
  await sendSlackNotification({
    channel: getPodChannel(podId),
    message: 'End of day reminder: Commit your work! 🚀'
  });
}
```

### Slack Bot Implementation

```typescript
// integrations/slack/src/index.ts
import { App, BlockAction, SlashCommand } from '@slack/bolt';
import { CLOSClient } from '@candlefish/clos-sdk';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN
});

const clos = new CLOSClient({
  endpoint: process.env.CLOS_API_ENDPOINT,
  apiKey: process.env.CLOS_API_KEY
});

// Daily unblock command
app.command('/unblock', async ({ command, ack, say }) => {
  await ack();
  
  const userId = command.user_id;
  const podId = await clos.getPodForUser(userId);
  
  await say({
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '☀️ Daily Unblock'
        }
      },
      {
        type: 'input',
        block_id: 'completed',
        label: {
          type: 'plain_text',
          text: 'What did you complete yesterday?'
        },
        element: {
          type: 'plain_text_input',
          multiline: true,
          action_id: 'completed_input'
        }
      },
      {
        type: 'input',
        block_id: 'today',
        label: {
          type: 'plain_text',
          text: 'What are you working on today?'
        },
        element: {
          type: 'plain_text_input',
          multiline: true,
          action_id: 'today_input'
        }
      },
      {
        type: 'input',
        block_id: 'blockers',
        label: {
          type: 'plain_text',
          text: 'Any blockers?'
        },
        element: {
          type: 'plain_text_input',
          multiline: true,
          action_id: 'blockers_input',
          placeholder: {
            type: 'plain_text',
            text: 'Leave blank if none'
          }
        },
        optional: true
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Submit'
            },
            style: 'primary',
            action_id: 'submit_unblock'
          }
        ]
      }
    ]
  });
});

// WIP status command
app.command('/wip', async ({ command, ack, say }) => {
  await ack();
  
  const podId = await clos.getPodForUser(command.user_id);
  const wipStatus = await clos.getWIPStatus(podId);
  
  const blocks = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*WIP Status for ${wipStatus.podName}*\n\nCurrent: ${wipStatus.current}/${wipStatus.limit}`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Active Items:*'
      }
    }
  ];
  
  wipStatus.items.forEach(item => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `• ${item.title} (${item.owner})`
      },
      accessory: {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'Complete'
        },
        action_id: `complete_${item.id}`
      }
    });
  });
  
  if (wipStatus.available > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✅ ${wipStatus.available} slots available`
      }
    });
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ WIP limit reached! Complete work before starting new items.'
      }
    });
  }
  
  await say({ blocks });
});

// Stage gate notification
app.action('approve_stage_gate', async ({ body, ack, client }) => {
  await ack();
  
  const projectId = body.actions[0].value;
  const result = await clos.approveStageGate(projectId, body.user.id);
  
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ Stage gate approved by <@${body.user.id}>\n\nProject advanced to: *${result.nextStage}*`
        }
      }
    ]
  });
});

// Start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ CLOS Slack bot is running!');
})();
```

---

## Infrastructure as Code

### Complete Terraform Setup

```hcl
# infrastructure/terraform/modules/monitoring/main.tf
resource "aws_cloudwatch_dashboard" "clos_main" {
  dashboard_name = "clos-main-dashboard"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/ECS", "CPUUtilization", { stat = "Average" }],
            [".", "MemoryUtilization", { stat = "Average" }]
          ]
          period = 300
          stat = "Average"
          region = "us-east-1"
          title = "ECS Cluster Metrics"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/RDS", "DatabaseConnections", { stat = "Sum" }],
            [".", "CPUUtilization", { stat = "Average" }]
          ]
          period = 300
          stat = "Average"
          region = "us-east-1"
          title = "Database Metrics"
        }
      }
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "wip_limit_breach" {
  alarm_name          = "clos-wip-limit-breach"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name        = "WIPLimitBreach"
  namespace          = "CLOS/WIP"
  period             = "300"
  statistic          = "Sum"
  threshold          = "0"
  alarm_description  = "WIP limit has been breached"
  alarm_actions      = [aws_sns_topic.alerts.arn]
}

resource "aws_sns_topic" "alerts" {
  name = "clos-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = "ops@candlefish.ai"
}

resource "aws_sns_topic_subscription" "alerts_slack" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "https"
  endpoint  = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
}
```

---

## Key Benefits of This Architecture

1. **Real Infrastructure**: Actual AWS services, not just documentation
2. **Automated Enforcement**: WIP limits and stage gates are programmatically enforced
3. **Real-time Visibility**: Live dashboards and metrics
4. **Integration**: Deep GitHub, Slack, Linear integration
5. **Scalable**: Can handle 100+ developers across multiple pods
6. **Measurable**: Every metric is tracked and queryable
7. **Extensible**: Easy to add new workflows and integrations

## Next Steps

1. **Review & Approve**: Get stakeholder buy-in on architecture
2. **Setup AWS Account**: Provision production AWS account
3. **Deploy Phase 1**: Core infrastructure and API
4. **Pilot with One Pod**: Test with a single team
5. **Iterate & Scale**: Refine based on feedback and roll out

This is a REAL system that will actually run and enforce your operating constraints.