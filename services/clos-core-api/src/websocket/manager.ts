import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { wsLogger as logger } from '../utils/logger';

interface AuthenticatedSocket {
  userId: string;
  userEmail: string;
  pod?: string;
  role: string;
}

export class WebSocketManager {
  private static instance: WebSocketManager;
  private io?: SocketServer;
  private server?: any;
  private authenticatedSockets = new Map<string, AuthenticatedSocket>();

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  async start(port: number): Promise<void> {
    logger.info('Starting WebSocket server', { port });

    // Create HTTP server for Socket.IO
    this.server = createServer();
    this.io = new SocketServer(this.server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        
        if (!token) {
          return next(new Error('Authentication token missing'));
        }

        // Verify JWT token (simplified - in production use proper JWT verification)
        const decoded = jwt.decode(token) as any;
        if (!decoded || !decoded.email) {
          return next(new Error('Invalid token'));
        }

        // Store user info in socket
        (socket as any).userId = decoded.sub;
        (socket as any).userEmail = decoded.email;
        (socket as any).userRole = decoded.role || 'user';
        (socket as any).userPod = decoded.pod;

        this.authenticatedSockets.set(socket.id, {
          userId: decoded.sub,
          userEmail: decoded.email,
          role: decoded.role || 'user',
          pod: decoded.pod,
        });

        logger.debug('Socket authenticated', {
          socketId: socket.id,
          userId: decoded.sub,
          userEmail: decoded.email,
        });

        next();
      } catch (error) {
        logger.error('Socket authentication failed', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handling
    this.io.on('connection', (socket) => {
      const userInfo = this.authenticatedSockets.get(socket.id);
      
      logger.info('Client connected', {
        socketId: socket.id,
        userId: userInfo?.userId,
        userEmail: userInfo?.userEmail,
      });

      // Join user-specific room
      if (userInfo?.userId) {
        socket.join(`user:${userInfo.userId}`);
      }

      // Join pod-specific room
      if (userInfo?.pod) {
        socket.join(`pod:${userInfo.pod}`);
      }

      // Join role-specific room
      socket.join(`role:${userInfo?.role || 'user'}`);

      // Handle subscription requests
      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });

      socket.on('unsubscribe', (data) => {
        this.handleUnsubscription(socket, data);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong');
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', {
          socketId: socket.id,
          userId: userInfo?.userId,
          reason,
        });
        
        this.authenticatedSockets.delete(socket.id);
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('Socket error', {
          socketId: socket.id,
          userId: userInfo?.userId,
          error,
        });
      });
    });

    // Start server
    await new Promise<void>((resolve) => {
      this.server!.listen(port, resolve);
    });

    logger.info('WebSocket server started successfully', { port });
  }

  async stop(): Promise<void> {
    if (this.io) {
      logger.info('Stopping WebSocket server');
      
      // Close all connections
      this.io.close();
      
      // Close HTTP server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(resolve);
        });
      }
      
      // Clear authenticated sockets
      this.authenticatedSockets.clear();
      
      logger.info('WebSocket server stopped');
    }
  }

  private handleSubscription(socket: any, data: { type: string; ideaId?: string; pod?: string }): void {
    const userInfo = this.authenticatedSockets.get(socket.id);
    
    logger.debug('Handling subscription', {
      socketId: socket.id,
      userId: userInfo?.userId,
      subscription: data,
    });

    switch (data.type) {
      case 'idea':
        if (data.ideaId) {
          socket.join(`idea:${data.ideaId}`);
        }
        break;
        
      case 'pod':
        if (data.pod) {
          socket.join(`pod:${data.pod}`);
        }
        break;
        
      case 'portfolio':
        socket.join('portfolio:metrics');
        break;
        
      case 'notifications':
        // Already joined user room on connection
        break;
        
      default:
        logger.warn('Unknown subscription type', { type: data.type });
    }
  }

  private handleUnsubscription(socket: any, data: { type: string; ideaId?: string; pod?: string }): void {
    const userInfo = this.authenticatedSockets.get(socket.id);
    
    logger.debug('Handling unsubscription', {
      socketId: socket.id,
      userId: userInfo?.userId,
      subscription: data,
    });

    switch (data.type) {
      case 'idea':
        if (data.ideaId) {
          socket.leave(`idea:${data.ideaId}`);
        }
        break;
        
      case 'pod':
        if (data.pod) {
          socket.leave(`pod:${data.pod}`);
        }
        break;
        
      case 'portfolio':
        socket.leave('portfolio:metrics');
        break;
    }
  }

  // Broadcast methods
  broadcast(event: string, data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting event', { event, data: typeof data });
    this.io.emit(event, data);
  }

  broadcastToUser(userId: string, event: string, data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting to user', { userId, event, data: typeof data });
    this.io.to(`user:${userId}`).emit(event, data);
  }

  broadcastToPod(pod: string, event: string, data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting to pod', { pod, event, data: typeof data });
    this.io.to(`pod:${pod}`).emit(event, data);
  }

  broadcastToRole(role: string, event: string, data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting to role', { role, event, data: typeof data });
    this.io.to(`role:${role}`).emit(event, data);
  }

  broadcastToIdea(ideaId: string, event: string, data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting to idea subscribers', { ideaId, event, data: typeof data });
    this.io.to(`idea:${ideaId}`).emit(event, data);
  }

  broadcastMetrics(data: any): void {
    if (!this.io) return;
    
    logger.debug('Broadcasting metrics update');
    this.io.to('portfolio:metrics').emit('metricsUpdated', data);
  }

  // Specific event methods
  notifyIdeaUpdate(ideaId: string, idea: any): void {
    this.broadcastToIdea(ideaId, 'ideaUpdated', idea);
    
    // Also notify idea owner and assignees
    if (idea.ownerId) {
      this.broadcastToUser(idea.ownerId, 'ideaUpdated', idea);
    }
    
    if (idea.assignees) {
      idea.assignees.forEach((assignee: any) => {
        this.broadcastToUser(assignee.id, 'ideaUpdated', idea);
      });
    }
  }

  notifyGatePromotion(idea: any, fromGate: string, toGate: string): void {
    const eventData = { idea, fromGate, toGate, timestamp: new Date() };
    
    // Broadcast to all interested parties
    this.broadcast('gatePromoted', eventData);
    
    // Notify pod members
    if (idea.pod) {
      this.broadcastToPod(idea.pod, 'gatePromoted', eventData);
    }
  }

  notifyWipLimitExceeded(wipLimit: any): void {
    const eventData = { wipLimit, timestamp: new Date() };
    
    // Notify relevant pod or all users
    if (wipLimit.pod) {
      this.broadcastToPod(wipLimit.pod, 'wipLimitExceeded', eventData);
    } else {
      this.broadcast('wipLimitExceeded', eventData);
    }
    
    // Notify admins
    this.broadcastToRole('admin', 'wipLimitExceeded', eventData);
  }

  sendNotification(userId: string, notification: any): void {
    this.broadcastToUser(userId, 'notificationReceived', notification);
  }

  sendSystemAlert(alert: any): void {
    // Send system alerts to admins and integrator pod
    this.broadcastToRole('admin', 'systemAlert', alert);
    this.broadcastToPod('INTEGRATOR', 'systemAlert', alert);
  }

  // Health check
  getConnectionCount(): number {
    return this.io?.engine.clientsCount || 0;
  }

  getAuthenticatedCount(): number {
    return this.authenticatedSockets.size;
  }

  getHealthStatus(): any {
    return {
      status: this.io ? 'healthy' : 'stopped',
      connections: this.getConnectionCount(),
      authenticated: this.getAuthenticatedCount(),
      uptime: process.uptime(),
    };
  }
}