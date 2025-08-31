# Candlefish Operating System v2.0 Dashboard

A production-ready Next.js dashboard providing real-time visibility into the entire Candlefish Operating System v2.0.

## Features

- **Real-time Dashboard**: Live metrics and system status updates
- **Portfolio Management**: Stage gate funnel visualization and project tracking
- **Pod Health Monitoring**: Real-time health scores and team metrics
- **WIP Limit Management**: Visual WIP tracking with violation alerts
- **Ideas Pipeline**: Idea ledger management and approval workflow
- **Decision Tracking**: Decision memo status and approval process
- **Analytics**: Advanced reporting and trend analysis
- **Authentication**: Secure login with NextAuth.js
- **Responsive Design**: Optimized for desktop and mobile devices

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom Candlefish brand colors
- **State Management**: Zustand + React Query
- **Real-time**: WebSocket + Socket.io
- **GraphQL**: Apollo Client
- **Authentication**: NextAuth.js
- **Charts**: Recharts
- **Animation**: Framer Motion
- **Icons**: Lucide React
- **UI Components**: Radix UI primitives

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Access to Candlefish CLOS v2.0 API

### Installation

1. **Clone and navigate to the dashboard**:
   ```bash
   cd apps/dashboard
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```
   
   Edit `.env.local` with your configuration:
   ```env
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=http://localhost:3000
   API_URL=http://localhost:4000
   NEXT_PUBLIC_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
   NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:4000
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

5. **Open dashboard**:
   Navigate to [http://localhost:3000](http://localhost:3000)

### Development Credentials

In development mode, use these test credentials:

- **Admin**: `admin@candlefish.ai` / `admin123`
- **Pod Lead**: `lead@candlefish.ai` / `lead123` 
- **Member**: `member@candlefish.ai` / `member123`

## Project Structure

```
src/
├── app/                    # Next.js 14 App Router pages
│   ├── auth/              # Authentication pages
│   ├── portfolio/         # Portfolio management
│   ├── pods/             # Pod dashboards
│   ├── ideas/            # Ideas ledger
│   ├── wip/              # WIP limit management
│   ├── decisions/        # Decision memo tracker
│   ├── analytics/        # Advanced analytics
│   └── api/              # API routes
├── components/           # React components
│   ├── ui/              # Base UI components
│   ├── dashboard/       # Dashboard-specific components
│   └── layout/          # Layout components
├── lib/                 # Utility libraries
│   ├── apollo.ts        # GraphQL client
│   ├── auth.ts          # NextAuth configuration
│   ├── websocket.ts     # WebSocket manager
│   └── utils.ts         # Helper utilities
├── hooks/              # Custom React hooks
├── types/              # TypeScript type definitions
└── styles/             # Global styles and Tailwind config
```

## Key Components

### Dashboard Layout
- **Sidebar Navigation**: Real-time status indicators
- **Header**: System health and connection status
- **Main Content**: Responsive grid layout

### Real-time Features
- **WebSocket Connection**: Live system updates
- **Activity Feed**: Real-time project and system events
- **Notifications**: Push notifications for critical alerts
- **Status Monitoring**: Live health scores and metrics

### Security Features
- **Authentication**: Secure login with session management
- **Role-based Access**: Different views for admins, pod leads, and members
- **CSRF Protection**: Built-in request validation
- **Secure Headers**: XSS and clickjacking protection

## Deployment

### Vercel (Recommended)

1. **Connect repository** to Vercel
2. **Set environment variables** in Vercel dashboard:
   ```env
   NEXTAUTH_SECRET=production-secret
   NEXTAUTH_URL=https://dashboard.candlefish.ai
   API_URL=https://api.candlefish.ai
   NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://api.candlefish.ai/graphql
   NEXT_PUBLIC_WEBSOCKET_URL=wss://api.candlefish.ai
   ```
3. **Deploy** - automatic deployment on git push

### Docker

```bash
# Build container
docker build -t candlefish-dashboard .

# Run container
docker run -p 3000:3000 \
  -e NEXTAUTH_SECRET=your-secret \
  -e NEXTAUTH_URL=https://your-domain.com \
  candlefish-dashboard
```

## API Integration

The dashboard integrates with the Candlefish CLOS v2.0 API:

- **GraphQL Endpoint**: For queries and mutations
- **WebSocket**: For real-time updates
- **REST API**: For authentication and file uploads

### Required API Endpoints

- `POST /auth/login` - User authentication
- `POST /auth/oauth/google` - Google OAuth
- `GET /graphql` - GraphQL endpoint
- `WS /graphql` - WebSocket subscriptions

## Performance

- **Code Splitting**: Automatic route-based splitting
- **Image Optimization**: Next.js Image component
- **Bundle Analysis**: `npm run analyze`
- **Caching**: React Query for data caching
- **Real-time**: Efficient WebSocket connection management

## Monitoring

- **Health Check**: `/api/health` endpoint
- **Error Tracking**: Built-in error boundaries
- **Performance**: Core Web Vitals tracking
- **Analytics**: User interaction tracking

## Contributing

1. **Follow TypeScript strict mode**
2. **Use provided UI components**
3. **Maintain responsive design**
4. **Add proper error handling**
5. **Test real-time features**
6. **Follow Candlefish brand guidelines**

## Support

For technical support or questions:
- **Documentation**: Internal Candlefish wiki
- **Issues**: GitHub Issues
- **Slack**: #clos-dashboard channel

---

**Version**: 2.0.0  
**Last Updated**: August 2025  
**License**: Proprietary - Candlefish AI