# Multi-stage build for production-ready CLOS Core API
FROM node:20-alpine AS base

# Install security updates and dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S clos -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Development stage
FROM base AS development
ENV NODE_ENV=development
RUN npm ci --include=dev
COPY . .
RUN npm run db:generate
EXPOSE 4000 4001
USER clos
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
ENV NODE_ENV=production
COPY . .
RUN npm ci --only=production --ignore-scripts && npm cache clean --force
RUN npm run db:generate
RUN npm run build

# Production stage
FROM node:20-alpine AS production
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init curl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S clos -u 1001

WORKDIR /app

# Copy production files
COPY --from=build --chown=clos:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=clos:nodejs /app/dist ./dist
COPY --from=build --chown=clos:nodejs /app/prisma ./prisma
COPY --from=build --chown=clos:nodejs /app/package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Security and runtime configuration
ENV NODE_ENV=production
ENV PORT=4000
ENV WS_PORT=4001
EXPOSE 4000 4001
USER clos

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]