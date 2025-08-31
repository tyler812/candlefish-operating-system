# CLOS Slack Bot v2.0

A comprehensive Slack bot for managing the Candlefish Operating System (CLOS) workflow. This bot provides seamless integration between Slack and CLOS, enabling teams to manage projects, blockers, ideas, decisions, and metrics directly from their Slack workspace.

## Features

### Core Commands
- **`/unblock`** - Daily unblock sessions to resolve project blockers
- **`/wip`** - Work-in-Progress status monitoring and alerts  
- **`/stage`** - Stage gate management and advancement requests
- **`/idea`** - Idea submission, tracking, and pipeline management
- **`/decision`** - Decision memo creation and approval workflows
- **`/demo`** - Demo Friday scheduling and signup management
- **`/metrics`** - Performance analytics and pod metrics
- **`/help`** - Comprehensive help system with contextual guidance

### Interactive Features
- **Personal Dashboard** - Home tab with personalized metrics and quick actions
- **Modal Forms** - Rich forms for idea submission, decision creation, and feedback
- **Button Actions** - Quick actions for approvals, status updates, and navigation
- **Real-time Notifications** - Automatic alerts for WIP violations, stage gates, and blockers

### Integrations
- **CLOS Core API** - Full integration with CLOS backend services
- **GitHub Webhooks** - PR notifications, issue tracking, and CI/CD alerts
- **Calendar Integration** - Meeting management and demo scheduling
- **Redis Caching** - Performance optimization and rate limiting

### Automation
- **Daily Reminders** - Standup preparation, blocker checks, and WIP monitoring
- **Weekly Reports** - Pod performance summaries and trend analysis
- **Monthly Analytics** - Executive summaries and strategic insights
- **Event-driven Workflows** - Automatic responses to system events

## Quick Start

### Prerequisites
- Node.js 18+ 
- Redis server
- Slack workspace with admin permissions
- CLOS API access

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd services/clos-slack-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create Slack App**
   - Go to [api.slack.com](https://api.slack.com/apps)
   - Click "Create New App" → "From an app manifest"
   - Paste the contents of `manifest.yml`
   - Install the app to your workspace

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

### Environment Variables

```env
# Slack Configuration
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your-bot-token-here  
SLACK_APP_TOKEN=xapp-your-app-token-here

# CLOS API Configuration
CLOS_API_URL=https://api.candlefish.ai
CLOS_API_KEY=your_clos_api_key_here

# Database Configuration
REDIS_URL=redis://localhost:6379

# Server Configuration
PORT=3000
NODE_ENV=development

# Optional Integrations
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
GITHUB_TOKEN=ghp_your_github_token
GOOGLE_CALENDAR_CREDENTIALS=path_to_credentials.json
```

## Usage Guide

### For Team Members

**Daily Workflow:**
1. Start your day with `/unblock` to address any blockers
2. Check your pod's capacity with `/wip`
3. Submit new ideas throughout the day with `/idea`
4. Create decision memos for important choices with `/decision`
5. Sign up for Demo Friday with `/demo`

**Personal Dashboard:**
- Click the "Home" tab in Slack to see your personalized dashboard
- View active projects, blocked items, and quick actions
- Get personalized tips and reminders

### For Pod Leaders

**Monitoring:**
- Use `/metrics pod` to track your pod's performance
- Monitor WIP utilization and throughput trends
- Review weekly and monthly reports automatically delivered to your pod channel

**Management:**
- Review and approve ideas from team members
- Guide stage gate advancement decisions
- Coordinate unblock sessions for the entire pod

### For Executives

**Strategic Insights:**
- Access company-wide metrics with `/metrics overall`
- Receive monthly executive summaries
- Compare pod performance across the organization
- Track innovation metrics and decision velocity

## Architecture

### Core Components

```
src/
├── commands/          # Slash command handlers
│   ├── unblock.ts    # Daily unblock sessions
│   ├── wip.ts        # WIP monitoring
│   ├── stage.ts      # Stage gate management
│   ├── idea.ts       # Idea pipeline
│   ├── decision.ts   # Decision memos
│   ├── demo.ts       # Demo scheduling
│   ├── metrics.ts    # Analytics dashboard
│   └── help.ts       # Help system
├── events/            # Event handlers
│   ├── stageGates.ts # Stage advancement workflows
│   ├── wipMonitoring.ts # WIP limit violations
│   ├── github.ts     # GitHub integration
│   └── calendar.ts   # Calendar events
├── interactions/      # Interactive components
│   ├── modals.ts     # Modal form handlers
│   ├── buttons.ts    # Button action handlers
│   └── homeTab.ts    # Personal dashboard
├── services/          # External integrations
│   ├── closApi.ts    # CLOS API client
│   ├── reminders.ts  # Automated reminders
│   └── notifications.ts # Report generation
└── utils/             # Helper functions
    ├── config.ts     # Configuration management
    ├── logger.ts     # Logging system
    ├── redis.ts      # Cache management
    └── helpers.ts    # Utility functions
```

### Data Flow

1. **User Interaction** → Slack command or button
2. **Bot Processing** → Command handler validates and processes
3. **API Integration** → Communicates with CLOS API
4. **Response Generation** → Creates rich Slack messages
5. **State Management** → Updates Redis cache
6. **Event Propagation** → Triggers related workflows

## Deployment

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **Monitor logs**
   ```bash
   docker-compose logs -f clos-slack-bot
   ```

### Production Deployment

1. **Configure production environment**
   ```bash
   export NODE_ENV=production
   # Set all required environment variables
   ```

2. **Build application**
   ```bash
   npm run build
   ```

3. **Start production server**
   ```bash
   npm start
   ```

### Kubernetes Deployment

See `k8s/` directory for Kubernetes manifests:
- Deployment configuration
- Service definitions  
- ConfigMaps and Secrets
- Ingress configuration
- Monitoring setup

## Configuration

### Slack App Setup

1. **App Manifest**: Use `manifest.yml` for complete app configuration
2. **Permissions**: Bot requires specific scopes for full functionality
3. **Event Subscriptions**: Configure webhook URL for real-time events
4. **Interactive Components**: Enable for buttons, modals, and home tab

### CLOS API Integration

The bot requires access to CLOS API endpoints:
- User management (`/users`)
- Project management (`/projects`) 
- Ideas and decisions (`/ideas`, `/decisions`)
- Metrics and analytics (`/metrics`)
- Activity logging (`/activities`)

### GitHub Integration

For GitHub webhook integration:
1. Configure webhook URL: `https://your-domain.com/webhook/github`
2. Select events: Pull requests, Issues, Pushes, Releases
3. Set webhook secret in environment variables

### Calendar Integration

For Google Calendar integration:
1. Create Google Cloud project
2. Enable Calendar API
3. Create service account credentials
4. Share calendars with service account

## Monitoring

### Built-in Monitoring

- **Health Check**: `/health` endpoint for uptime monitoring
- **Metrics**: Prometheus metrics for performance tracking
- **Logging**: Structured logging with Winston
- **Redis Monitoring**: Connection status and cache performance

### Grafana Dashboards

The deployment includes Grafana dashboards for:
- Bot performance metrics
- Command usage statistics  
- Error rates and response times
- User engagement analytics

### Alerts

Configure alerts for:
- High error rates
- Slow response times
- Redis connection failures
- CLOS API unavailability

## Development

### Running Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run typecheck

# Format code
npm run format
```

### Adding New Commands

1. Create command handler in `src/commands/`
2. Register command in `src/index.ts`
3. Add to Slack app manifest
4. Update help documentation
5. Write tests

### Adding New Integrations

1. Create service client in `src/services/`
2. Add environment configuration
3. Register event handlers if needed
4. Update Docker configuration
5. Document integration setup

## Security

### Best Practices

- **Environment Variables**: Store all secrets in environment variables
- **Input Validation**: Sanitize all user inputs
- **Rate Limiting**: Implemented via Redis
- **HTTPS Only**: Enforce secure connections
- **Minimal Permissions**: Use least-privilege principle

### Security Considerations

- Slack tokens have specific scopes
- Redis is used for temporary data only
- All API calls are authenticated
- Webhook signatures are verified
- User permissions are checked

## Troubleshooting

### Common Issues

**Bot not responding to commands:**
- Check Slack app installation
- Verify webhook URL configuration
- Review bot permissions

**API connection failures:**
- Confirm CLOS API URL and key
- Check network connectivity
- Review API rate limits

**Redis connection errors:**
- Verify Redis server status
- Check connection string
- Review Redis memory usage

### Debug Mode

Enable debug logging:
```bash
export LOG_LEVEL=debug
npm run dev
```

### Logs Analysis

Key log categories:
- `slack.*` - Slack API interactions
- `clos.*` - CLOS API calls  
- `cache.*` - Redis operations
- `webhook.*` - Webhook processing

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Code Style

- Use TypeScript for type safety
- Follow ESLint configuration
- Write comprehensive JSDoc comments
- Maintain test coverage above 80%

## Support

For support and questions:
- Create an issue in the repository
- Contact the CLOS team via Slack
- Review documentation and troubleshooting guide

## License

Copyright (c) 2024 Candlefish. All rights reserved.

---

**CLOS Bot v2.0** - Streamlining workflow management through intelligent Slack integration.