import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server-plugin-landing-page-local-default';
import { readFileSync } from 'fs';
import { join } from 'path';

import { createContext, Context } from './context';
import { resolvers } from './resolvers';
import { authMiddleware } from './middleware/auth';
import { errorMiddleware } from './middleware/error';
import { loggingMiddleware } from './middleware/logging';
import { validationMiddleware } from './middleware/validation';
import { WebSocketManager } from './websocket/manager';
import { EventPublisher } from './events/publisher';
import { logger } from './utils/logger';
import { initializeMetrics } from './utils/metrics';
import { prisma } from './utils/database';

const PORT = parseInt(process.env.PORT || '4000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '4001', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

async function startServer() {
  try {
    // Initialize Express app
    const app = express();
    const httpServer = http.createServer(app);

    // Trust proxy for rate limiting and security
    app.set('trust proxy', 1);

    // Security middleware
    app.use(helmet({
      contentSecurityPolicy: NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: NODE_ENV === 'production' ? 100 : 1000, // Limit each IP
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use('/graphql', limiter);

    // Basic middleware
    app.use(compression());
    app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Custom middleware
    app.use(loggingMiddleware);

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        
        res.status(200).json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: NODE_ENV,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
      } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Database connection failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Readiness check for Kubernetes
    app.get('/ready', async (req, res) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'ready' });
      } catch (error) {
        res.status(503).json({ status: 'not ready' });
      }
    });

    // Metrics endpoint
    app.get('/metrics', (req, res) => {
      // Implement Prometheus metrics here if needed
      res.set('Content-Type', 'text/plain');
      res.send('# HELP clos_api_info CLOS API Information\\n# TYPE clos_api_info gauge\\nclos_api_info{version=\"1.0.0\"} 1\\n');
    });

    // Load GraphQL schema
    const typeDefs = readFileSync(join(__dirname, 'schema.graphql'), 'utf8');

    // Create Apollo Server
    const server = new ApolloServer<Context>({
      typeDefs,
      resolvers,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        NODE_ENV === 'development' 
          ? ApolloServerPluginLandingPageLocalDefault({ embed: true })
          : undefined,
      ].filter(Boolean),
      introspection: NODE_ENV !== 'production',
      formatError: (formattedError, error) => {
        // Log the error
        logger.error('GraphQL Error:', {
          message: formattedError.message,
          path: formattedError.path,
          originalError: error,
        });

        // Don't leak internal errors in production
        if (NODE_ENV === 'production' && !error.extensions?.code) {
          return new Error('Internal server error');
        }

        return formattedError;
      },
    });

    // Start Apollo Server
    await server.start();

    // Apply GraphQL middleware
    app.use('/graphql',
      authMiddleware,
      validationMiddleware,
      expressMiddleware(server, {
        context: createContext,
      })
    );

    // Initialize WebSocket manager
    const wsManager = new WebSocketManager();
    await wsManager.start(WS_PORT);

    // Initialize event publisher
    const eventPublisher = new EventPublisher();
    await eventPublisher.initialize();

    // Initialize metrics collection
    await initializeMetrics();

    // Error handling middleware (must be last)
    app.use(errorMiddleware);

    // Start HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, resolve);
    });

    logger.info(`🚀 CLOS Core API Server ready at http://localhost:${PORT}/graphql`);
    logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
    logger.info(`🔌 WebSocket server ready at ws://localhost:${WS_PORT}`);
    logger.info(`🌍 Environment: ${NODE_ENV}`);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      
      // Close servers gracefully
      await server.stop();
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      
      await wsManager.stop();
      await eventPublisher.close();
      await prisma.$disconnect();
      
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received: closing HTTP server');
      
      await server.stop();
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      
      await wsManager.stop();
      await eventPublisher.close();
      await prisma.$disconnect();
      
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});