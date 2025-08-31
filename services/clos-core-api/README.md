# CLOS Core API

Production-ready GraphQL API service for the Candlefish Operating System (CLOS). This service provides comprehensive stage gate management, WIP limit enforcement, real-time updates, and portfolio analytics.

## Architecture

- **Framework**: Express.js with TypeScript
- **GraphQL**: Apollo Server with full federation support  
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for session management and pub/sub
- **Real-time**: WebSocket support for live updates
- **Events**: AWS EventBridge integration
- **Authentication**: Auth0 JWT validation
- **Deployment**: Docker containers on AWS ECS Fargate

## Features

### Core CLOS Functionality
- ✅ **Stage Gate Management**: Automated gate progression with validation
- ✅ **WIP Limit Enforcement**: Real-time tracking and blocking
- ✅ **Portfolio Analytics**: Comprehensive metrics and reporting
- ✅ **Decision Memo Workflow**: Collaborative decision making
- ✅ **Activity Tracking**: Complete audit trail
- ✅ **Real-time Notifications**: WebSocket-based updates

### Technical Features
- ✅ **GraphQL API**: Fully typed schema with introspection
- ✅ **DataLoader Pattern**: Efficient data fetching with N+1 prevention
- ✅ **JWT Authentication**: Auth0 integration with role-based access
- ✅ **Rate Limiting**: Protection against abuse
- ✅ **Query Complexity Limits**: GraphQL security
- ✅ **Comprehensive Logging**: Structured logging with pino
- ✅ **Health Checks**: Kubernetes-ready endpoints
- ✅ **Error Handling**: Detailed error reporting

## Quick Start

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- AWS CLI (for EventBridge)
- Auth0 account (for authentication)

### Local Development

1. **Clone and setup:**
```bash
cd services/clos-core-api
npm install
cp .env.example .env
```

2. **Start infrastructure:**
```bash
docker-compose up -d postgres redis localstack
```

3. **Setup database:**
```bash
npm run db:migrate
npm run db:seed
```

4. **Start development server:**
```bash
npm run dev
```

The API will be available at:
- GraphQL Playground: http://localhost:4000/graphql
- WebSocket: ws://localhost:4001
- Health Check: http://localhost:4000/health

### Docker Development

```bash
# Start all services
docker-compose up

# View logs
docker-compose logs -f clos-api

# Stop services
docker-compose down
```

## API Documentation

### GraphQL Endpoints

**Main API**: `POST /graphql`
- Full GraphQL schema with mutations, queries, and subscriptions
- Authentication via `Authorization: Bearer <token>` header
- Playground available in development mode

**Health Check**: `GET /health`
- Returns service health status and database connectivity
- Used by Kubernetes health probes

**Metrics**: `GET /metrics`
- Prometheus-compatible metrics endpoint
- Performance and business metrics

### Key Schema Types

```graphql
type Idea {
  id: ID!
  title: String!
  problemStatement: String!
  hypothesis: String!
  gate: StageGate!
  score: Float!
  owner: User
  activities: [Activity!]!
}

type StageGateMetrics {
  gate: StageGate!
  count: Int!
  averageTimeInGate: Float!
  promotionRate: Float!
}
```

## Business Logic

### Stage Gates
The system implements a 5-stage gate process:

1. **Spark**: Idea capture and qualification
2. **Seed**: Feasibility validation and planning  
3. **Scaffold**: Core functionality development
4. **Ship**: Production release
5. **Scale**: Optimization and expansion

Each gate has:
- Entry/exit criteria validation
- Required artifacts checking
- Reviewer assignment
- SLA monitoring
- Auto-kill triggers

### WIP Limits
Multi-level WIP limit enforcement:
- **Per-Pod**: Limits by pod and gate combination
- **Cross-Pod**: Global limits per gate
- **Portfolio**: Total active ideas limit
- **Per-Person**: Individual ownership limits

### Real-time Updates
WebSocket subscriptions for:
- Idea updates and gate promotions
- WIP limit violations
- New notifications
- Portfolio metrics changes
- System alerts

## Authentication & Authorization

### Auth0 Integration
- JWT token validation
- User creation/synchronization
- Role-based access control
- Pod-based permissions

### Security Features
- Rate limiting per IP and user
- GraphQL query depth/complexity limits
- Input sanitization and validation
- CORS protection
- Helmet security headers

## Deployment

### AWS ECS Fargate
The service is designed for containerized deployment:

```bash
# Build production image
docker build -t clos-core-api .

# Deploy to ECS (via CI/CD)
aws ecs update-service --cluster clos-cluster --service clos-api
```

### Environment Configuration
Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string  
- `AUTH0_*`: Auth0 configuration
- `AWS_*`: AWS credentials and region
- `EVENTBRIDGE_*`: EventBridge configuration

### Health Monitoring
- `/health` endpoint for load balancer checks
- `/ready` endpoint for Kubernetes readiness
- CloudWatch metrics integration
- Structured logging for observability

## Development

### Project Structure
```
src/
├── resolvers/          # GraphQL resolvers
├── services/           # Business logic services
├── middleware/         # Express middleware
├── events/            # EventBridge publishers
├── websocket/         # WebSocket management
├── utils/             # Shared utilities
└── types/             # TypeScript definitions
```

### Key Services
- **StageGateService**: Gate promotion logic and validation
- **WipLimitService**: WIP limit tracking and enforcement
- **EventPublisher**: AWS EventBridge integration
- **WebSocketManager**: Real-time communication
- **MetricsService**: Portfolio analytics

### Database Schema
Prisma-managed PostgreSQL schema with:
- Full-text search capabilities
- Audit logging
- Optimized indexes
- Migration management

### Testing
```bash
# Unit tests
npm run test

# Integration tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## API Examples

### Create a New Idea
```graphql
mutation CreateIdea($input: CreateIdeaInput!) {
  createIdea(input: $input) {
    id
    title
    gate
    score
    owner {
      name
    }
  }
}
```

### Promote Stage Gate
```graphql
mutation PromoteGate($input: PromoteGateInput!) {
  promoteGate(input: $input) {
    id
    gate
    activities {
      description
      createdAt
    }
  }
}
```

### Portfolio Metrics
```graphql
query PortfolioMetrics {
  portfolioMetrics {
    totalIdeas
    activeIdeas
    velocity
    gateDistribution {
      gate
      count
    }
  }
}
```

### Real-time Subscriptions
```graphql
subscription IdeaUpdates {
  ideaUpdated {
    id
    title
    gate
  }
}
```

## Monitoring & Observability

### Logging
- Structured JSON logs with request correlation
- Configurable log levels
- Sensitive data redaction
- Request/response logging

### Metrics
- API response times and error rates
- Business metrics (ideas, gates, velocity)
- Database query performance
- WebSocket connection counts

### Alerting
EventBridge integration enables:
- Slack notifications for gate promotions
- Email alerts for WIP violations
- System health monitoring
- Performance threshold alerts

## Contributing

1. Follow TypeScript strict mode
2. Add tests for new functionality
3. Update GraphQL schema documentation
4. Use conventional commit messages
5. Ensure Docker builds succeed

## License

Proprietary - Candlefish AI

---

**Production Status**: ✅ Ready for deployment
**Last Updated**: August 2025