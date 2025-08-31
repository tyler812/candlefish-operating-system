import { PrismaClient, NotificationType } from '@prisma/client';
import { EventPublisher } from '../events/publisher';
import { WebSocketManager } from '../websocket/manager';
import { logger } from '../utils/logger';

interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  ideaId?: string;
  metadata?: any;
}

export class NotificationService {
  constructor(
    private prisma: PrismaClient,
    private eventPublisher: EventPublisher,
    private wsManager: WebSocketManager
  ) {}

  async createNotification(input: NotificationInput): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: input,
        include: { idea: true },
      });

      logger.debug('Notification created', {
        notificationId: notification.id,
        type: notification.type,
        userId: notification.userId,
      });

      // Send real-time notification via WebSocket
      this.wsManager.sendNotification(notification.userId, notification);

      // Publish notification event
      await this.eventPublisher.publishNotificationEvent('notification.created', notification);

    } catch (error) {
      logger.error('Failed to create notification', error);
      throw error;
    }
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId, // Ensure user can only mark their own notifications
      },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }
}