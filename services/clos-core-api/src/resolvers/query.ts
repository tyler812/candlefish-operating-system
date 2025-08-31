import { Context } from '../context';
import { AuthenticationError, NotFoundError } from '../middleware/error';
import { StageGateService } from '../services/stageGate';
import { WipLimitService } from '../services/wipLimit';
import { MetricsService } from '../services/metrics';

export const queryResolvers = {
  // Idea queries
  async ideas(_: any, args: any, context: Context) {
    const { filter = {}, sort = { field: 'updatedAt', direction: 'DESC' }, limit = 50, offset = 0 } = args;
    
    const whereClause: any = {
      gate: { not: 'KILLED' }, // Exclude killed ideas by default
    };

    // Apply filters
    if (filter.gates?.length) {
      whereClause.gate = { in: filter.gates };
    }
    if (filter.pods?.length) {
      whereClause.pod = { in: filter.pods };
    }
    if (filter.owners?.length) {
      whereClause.ownerId = { in: filter.owners };
    }
    if (filter.tags?.length) {
      whereClause.tags = { hasSome: filter.tags };
    }
    if (filter.customerRequest !== undefined) {
      whereClause.customerRequest = filter.customerRequest;
    }
    if (filter.minScore) {
      whereClause.score = { gte: filter.minScore };
    }
    if (filter.maxScore) {
      whereClause.score = { ...(whereClause.score || {}), lte: filter.maxScore };
    }
    if (filter.reviewDue) {
      whereClause.nextReview = { lte: new Date() };
    }

    // Apply sorting
    const orderBy: any = {};
    orderBy[sort.field] = sort.direction.toLowerCase();

    const ideas = await context.prisma.idea.findMany({
      where: whereClause,
      orderBy,
      take: limit,
      skip: offset,
      include: {
        owner: true,
        assignees: true,
      },
    });

    return ideas;
  },

  async idea(_: any, { id }: { id: string }, context: Context) {
    const idea = await context.prisma.idea.findUnique({
      where: { id },
      include: {
        owner: true,
        assignees: true,
        activities: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        reviews: {
          include: { reviewer: true },
          orderBy: { createdAt: 'desc' },
        },
        decisionMemo: {
          include: {
            author: true,
            votes: { include: { user: true } },
          },
        },
      },
    });

    if (!idea) {
      throw new NotFoundError('Idea not found');
    }

    return idea;
  },

  async ideaByGithubUrl(_: any, { url }: { url: string }, context: Context) {
    const idea = await context.prisma.idea.findFirst({
      where: { githubIssueUrl: url },
      include: {
        owner: true,
        assignees: true,
      },
    });

    return idea;
  },

  // User queries
  async users(_: any, { active = true }: { active?: boolean }, context: Context) {
    const users = await context.prisma.user.findMany({
      where: active !== undefined ? { isActive: active } : {},
      orderBy: { name: 'asc' },
    });

    return users;
  },

  async user(_: any, { id }: { id: string }, context: Context) {
    const user = await context.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  },

  async me(_: any, __: any, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    return context.user.dbUser;
  },

  // Portfolio queries
  async portfolioMetrics(_: any, __: any, context: Context) {
    const metricsService = new MetricsService(context.prisma);
    return await metricsService.getPortfolioMetrics();
  },

  async podHealth(_: any, { pod }: { pod?: string }, context: Context) {
    const metricsService = new MetricsService(context.prisma);
    return await metricsService.getPodHealth(pod);
  },

  async wipLimits(_: any, __: any, context: Context) {
    const wipService = new WipLimitService(context.prisma, context.eventPublisher);
    return await wipService.getAllLimits();
  },

  // Decision memo queries
  async decisionMemos(_: any, { ideaId }: { ideaId?: string }, context: Context) {
    const whereClause = ideaId ? { ideaId } : {};

    const memos = await context.prisma.decisionMemo.findMany({
      where: whereClause,
      include: {
        author: true,
        idea: true,
        votes: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return memos;
  },

  async decisionMemo(_: any, { id }: { id: string }, context: Context) {
    const memo = await context.prisma.decisionMemo.findUnique({
      where: { id },
      include: {
        author: true,
        idea: true,
        votes: { include: { user: true } },
      },
    });

    if (!memo) {
      throw new NotFoundError('Decision memo not found');
    }

    return memo;
  },

  // Activity queries
  async activities(_: any, args: any, context: Context) {
    const { ideaId, userId, limit = 50 } = args;
    
    const whereClause: any = {};
    if (ideaId) whereClause.ideaId = ideaId;
    if (userId) whereClause.userId = userId;

    const activities = await context.prisma.activity.findMany({
      where: whereClause,
      include: {
        user: true,
        idea: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return activities;
  },

  // Notification queries
  async notifications(_: any, { unreadOnly = false }: { unreadOnly?: boolean }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const whereClause: any = { userId: context.user.dbUser.id };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const notifications = await context.prisma.notification.findMany({
      where: whereClause,
      include: { idea: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return notifications;
  },

  // Analytics queries
  async stageGateMetrics(_: any, __: any, context: Context) {
    const metricsService = new MetricsService(context.prisma);
    return await metricsService.getStageGateMetrics();
  },

  async velocityReport(_: any, { pod, timeframe = '30d' }: { pod?: string; timeframe?: string }, context: Context) {
    const metricsService = new MetricsService(context.prisma);
    return await metricsService.getVelocityReport(pod, timeframe);
  },

  async qualityReport(_: any, { timeframe = '30d' }: { timeframe?: string }, context: Context) {
    const metricsService = new MetricsService(context.prisma);
    return await metricsService.getQualityReport(timeframe);
  },

  // System queries
  async health(_: any, __: any, context: Context) {
    try {
      // Test database connection
      await context.prisma.$queryRaw`SELECT 1`;
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'healthy',
          redis: 'healthy', // TODO: Add Redis health check
          eventbridge: 'healthy', // TODO: Add EventBridge health check
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  },

  async version(_: any, __: any, context: Context) {
    return process.env.npm_package_version || '1.0.0';
  },
};