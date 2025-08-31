# Candlefish OS v2.0 Dashboard - Deployment Guide

## Quick Start (Development)

```bash
# Navigate to dashboard
cd apps/dashboard

# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Edit .env.local with your configuration

# Start development server
npm run dev

# Open http://localhost:3000
```

## Production Deployment

### Vercel (Recommended)

1. **Connect Repository**: 
   - Connect your Git repository to Vercel
   - Select the `apps/dashboard` directory as the root

2. **Environment Variables**:
   ```
   NEXTAUTH_SECRET=your-production-secret-key
   NEXTAUTH_URL=https://dashboard.candlefish.ai
   API_URL=https://api.candlefish.ai
   NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://api.candlefish.ai/graphql
   NEXT_PUBLIC_WEBSOCKET_URL=wss://api.candlefish.ai
   ```

3. **Build Settings**:
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

4. **Deploy**: Automatic deployment on git push to main branch

### Manual Build

```bash
# Install dependencies
npm ci

# Build for production
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build container
docker build -t candlefish-dashboard .

# Run container
docker run -d \
  -p 3000:3000 \
  -e NEXTAUTH_SECRET=your-secret \
  -e NEXTAUTH_URL=https://dashboard.candlefish.ai \
  -e API_URL=https://api.candlefish.ai \
  --name candlefish-dashboard \
  candlefish-dashboard
```

## Environment Configuration

### Development (.env.local)
```bash
NEXTAUTH_SECRET=dev-secret-key-123
NEXTAUTH_URL=http://localhost:3000
API_URL=http://localhost:4000
NEXT_PUBLIC_GRAPHQL_ENDPOINT=http://localhost:4000/graphql
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:4000
```

### Production (.env.production)
```bash
NEXTAUTH_SECRET=super-secure-production-secret-key
NEXTAUTH_URL=https://dashboard.candlefish.ai
API_URL=https://api.candlefish.ai
NEXT_PUBLIC_GRAPHQL_ENDPOINT=https://api.candlefish.ai/graphql
NEXT_PUBLIC_WEBSOCKET_URL=wss://api.candlefish.ai
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
```

## Health Checks

The dashboard includes a health check endpoint:

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-08-31T10:00:00.000Z",
  "uptime": 1234567,
  "version": "2.0.0",
  "environment": "production",
  "services": {
    "dashboard": "healthy",
    "auth": "healthy"
  }
}
```

## Performance Optimization

- **Bundle Analysis**: `npm run build` includes bundle analysis
- **Image Optimization**: Next.js automatic image optimization
- **Code Splitting**: Automatic route-based code splitting
- **Caching**: React Query for efficient data caching
- **WebSocket**: Optimized real-time connection management

## Security Headers

The dashboard includes security headers via `vercel.json`:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security: HSTS enabled
- Referrer-Policy: strict-origin-when-cross-origin

## Monitoring

### Application Monitoring
- Error boundaries for graceful error handling
- Real-time system status monitoring
- WebSocket connection health tracking

### Infrastructure Monitoring
- Health check endpoint for uptime monitoring
- Performance metrics collection
- Error tracking and logging

## Troubleshooting

### Common Issues

1. **Authentication Issues**:
   - Verify NEXTAUTH_SECRET is set
   - Check NEXTAUTH_URL matches your domain
   - Ensure API_URL is accessible

2. **Real-time Connection Issues**:
   - Verify WebSocket URL is correct
   - Check firewall settings for WebSocket connections
   - Ensure API server supports WebSocket connections

3. **Build Issues**:
   - Run `npm run typecheck` to check TypeScript errors
   - Run `npm run lint` to check linting issues
   - Clear `.next` directory and rebuild

### Debug Mode

Enable debug logging in development:
```bash
DEBUG=* npm run dev
```

## Post-Deployment Checklist

- [ ] Health check endpoint responds correctly
- [ ] Authentication flow works end-to-end
- [ ] Real-time features are functioning
- [ ] All dashboard metrics load correctly
- [ ] Mobile responsive design works
- [ ] Error boundaries handle failures gracefully
- [ ] Performance metrics are acceptable
- [ ] Security headers are applied
- [ ] SSL certificate is valid
- [ ] Domain is correctly configured

## Support

For deployment issues:
- Check application logs in Vercel dashboard
- Verify all environment variables are set
- Test API connectivity from deployment environment
- Review Next.js deployment documentation