import { PrismaClient, ActivityType } from '@prisma/client';
import { EventPublisher } from '../events/publisher';
import { logger } from '../utils/logger';

interface ActivityInput {
  type: ActivityType;
  description: string;
  ideaId: string;
  userId: string;
  metadata?: any;
}

export class ActivityService {
  constructor(
    private prisma: PrismaClient,
    private eventPublisher: EventPublisher
  ) {}

  async logActivity(input: ActivityInput): Promise<void> {
    try {
      const activity = await this.prisma.activity.create({
        data: input,
        include: {
          user: true,
          idea: true,
        },
      });

      logger.debug('Activity logged', {
        activityId: activity.id,
        type: activity.type,
        ideaId: activity.ideaId,
        userId: activity.userId,
      });

      // Publish activity event
      await this.eventPublisher.publishEvent('activity.created', {
        activityId: activity.id,
        type: activity.type,
        ideaId: activity.ideaId,
        userId: activity.userId,
        timestamp: activity.createdAt,
      });
    } catch (error) {
      logger.error('Failed to log activity', error);
      throw error;
    }
  }

  async getActivitiesForIdea(ideaId: string, limit = 50): Promise<any[]> {
    return await this.prisma.activity.findMany({
      where: { ideaId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getActivitiesForUser(userId: string, limit = 50): Promise<any[]> {
    return await this.prisma.activity.findMany({
      where: { userId },
      include: { idea: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}