import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { eventLogger as logger } from '../utils/logger';

interface EventPayload {
  [key: string]: any;
}

interface StageGateEvent extends EventPayload {
  ideaId: string;
  fromGate?: string;
  toGate?: string;
  gate?: string;
  userId: string;
  timestamp: Date;
  reason?: string;
}

interface IdeaEvent extends EventPayload {
  id: string;
  title: string;
  gate: string;
  pod?: string;
  ownerId?: string;
}

interface WipEvent extends EventPayload {
  type: string;
  gate?: string;
  pod?: string;
  current: number;
  limit: number;
  timestamp: Date;
}

export class EventPublisher {
  private static instance: EventPublisher;
  private eventBridge?: EventBridgeClient;
  private eventBusName: string;
  private source: string;

  constructor() {
    this.eventBusName = process.env.EVENTBRIDGE_BUS_NAME || 'clos-events';
    this.source = process.env.EVENTBRIDGE_SOURCE || 'clos.core-api';
  }

  static getInstance(): EventPublisher {
    if (!EventPublisher.instance) {
      EventPublisher.instance = new EventPublisher();
    }
    return EventPublisher.instance;
  }

  async initialize(): Promise<void> {
    try {
      // Initialize EventBridge client
      this.eventBridge = new EventBridgeClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      logger.info('EventBridge publisher initialized', {
        eventBusName: this.eventBusName,
        source: this.source,
        region: process.env.AWS_REGION || 'us-east-1',
      });
    } catch (error) {
      logger.error('Failed to initialize EventBridge publisher', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.eventBridge) {
      this.eventBridge.destroy();
      logger.info('EventBridge publisher closed');
    }
  }

  // Generic event publishing method
  private async publishEvent(
    detailType: string,
    detail: EventPayload,
    resources?: string[]
  ): Promise<void> {
    if (!this.eventBridge) {
      logger.warn('EventBridge not initialized, skipping event publish', { detailType });
      return;
    }

    try {
      const event = {
        Source: this.source,
        DetailType: detailType,
        Detail: JSON.stringify({
          ...detail,
          timestamp: detail.timestamp || new Date(),
          environment: process.env.NODE_ENV || 'development',
        }),
        EventBusName: this.eventBusName,
        Resources: resources || [],
      };

      const command = new PutEventsCommand({
        Entries: [event],
      });

      const result = await this.eventBridge.send(command);
      
      if (result.FailedEntryCount && result.FailedEntryCount > 0) {
        logger.error('Event publishing failed', {
          detailType,
          failedEntries: result.Entries?.filter(entry => entry.ErrorCode),
        });
      } else {
        logger.debug('Event published successfully', {
          detailType,
          eventId: result.Entries?.[0]?.EventId,
        });
      }
    } catch (error) {
      logger.error('Failed to publish event', {
        detailType,
        error: error.message,
        detail,
      });
      
      // Don't throw error to avoid breaking the main flow
      // Events are important but not critical for core functionality
    }
  }

  // Stage gate events
  async publishStageGateEvent(eventType: string, event: StageGateEvent): Promise<void> {
    await this.publishEvent(
      `Stage Gate ${eventType.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`,
      event,
      [`arn:aws:clos:idea:${event.ideaId}`]
    );
  }

  // Idea lifecycle events
  async publishIdeaEvent(eventType: string, idea: IdeaEvent): Promise<void> {
    await this.publishEvent(
      `Idea ${eventType.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`,
      {
        ideaId: idea.id,
        title: idea.title,
        gate: idea.gate,
        pod: idea.pod,
        ownerId: idea.ownerId,
        timestamp: new Date(),
      },
      [`arn:aws:clos:idea:${idea.id}`]
    );
  }

  // WIP limit events
  async publishWipEvent(eventType: string, event: WipEvent): Promise<void> {
    await this.publishEvent(
      `WIP Limit ${eventType.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`,
      event
    );
  }

  // Notification events
  async publishNotificationEvent(eventType: string, notification: any): Promise<void> {
    await this.publishEvent(
      `Notification ${eventType.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`,
      {
        notificationId: notification.id,
        type: notification.type,
        userId: notification.userId,
        ideaId: notification.ideaId,
        timestamp: new Date(),
      },
      [
        `arn:aws:clos:user:${notification.userId}`,
        ...(notification.ideaId ? [`arn:aws:clos:idea:${notification.ideaId}`] : []),
      ]
    );
  }

  // System events
  async publishSystemEvent(eventType: string, details: EventPayload): Promise<void> {
    await this.publishEvent(
      `System ${eventType.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`,
      {
        ...details,
        service: 'clos-core-api',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date(),
      }
    );
  }

  // Metrics events
  async publishMetricsEvent(metrics: any): Promise<void> {
    await this.publishEvent(
      'Portfolio Metrics Updated',
      {
        totalIdeas: metrics.totalIdeas,
        activeIdeas: metrics.activeIdeas,
        velocity: metrics.velocity,
        wipUtilization: metrics.wipUtilization,
        timestamp: new Date(),
      }
    );
  }

  // GitHub integration events
  async publishGitHubEvent(eventType: string, payload: any): Promise<void> {
    await this.publishEvent(
      `GitHub ${eventType}`,
      {
        repository: payload.repository?.name,
        action: payload.action,
        issueNumber: payload.issue?.number,
        pullRequestNumber: payload.pull_request?.number,
        sender: payload.sender?.login,
        timestamp: new Date(),
      },
      [
        ...(payload.repository ? [`arn:aws:github:repo:${payload.repository.full_name}`] : []),
        ...(payload.issue ? [`arn:aws:github:issue:${payload.issue.id}`] : []),
      ]
    );
  }

  // Slack integration events
  async publishSlackEvent(eventType: string, details: EventPayload): Promise<void> {
    await this.publishEvent(
      `Slack ${eventType}`,
      {
        ...details,
        timestamp: new Date(),
      }
    );
  }

  // Audit events
  async publishAuditEvent(
    entity: string,
    entityId: string,
    action: string,
    userId: string,
    changes?: any
  ): Promise<void> {
    await this.publishEvent(
      'Audit Log Entry',
      {
        entity,
        entityId,
        action,
        userId,
        changes,
        timestamp: new Date(),
      },
      [`arn:aws:clos:${entity}:${entityId}`]
    );
  }

  // Health check events
  async publishHealthEvent(status: 'healthy' | 'unhealthy', details?: any): Promise<void> {
    await this.publishEvent(
      'Service Health Check',
      {
        status,
        service: 'clos-core-api',
        details,
        timestamp: new Date(),
      }
    );
  }

  // Performance events
  async publishPerformanceEvent(operation: string, duration: number, metadata?: any): Promise<void> {
    await this.publishEvent(
      'Performance Metric',
      {
        operation,
        duration,
        metadata,
        timestamp: new Date(),
      }
    );
  }

  // Error events
  async publishErrorEvent(error: Error, context?: any): Promise<void> {
    await this.publishEvent(
      'Application Error',
      {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        context,
        timestamp: new Date(),
      }
    );
  }
}