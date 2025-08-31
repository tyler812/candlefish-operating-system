import { Context } from '../context';
import { AuthenticationError, NotFoundError, BusinessLogicError } from '../middleware/error';
import { StageGateService } from '../services/stageGate';
import { WipLimitService } from '../services/wipLimit';
import { NotificationService } from '../services/notification';
import { ActivityService } from '../services/activity';

export const mutationResolvers = {
  // Idea mutations
  async createIdea(_: any, { input }: { input: any }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    // Calculate initial score
    const score = (input.impact * input.strategicFit) / input.effort;

    const idea = await context.prisma.idea.create({
      data: {
        ...input,
        score,
        ownerId: context.user.dbUser.id,
        gate: 'SPARK',
        nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'CREATED',
      description: `Idea "${idea.title}" was created`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    // Publish event
    await context.eventPublisher.publishIdeaEvent('idea.created', idea);

    // Send WebSocket update
    context.wsManager.broadcast('ideaCreated', idea);

    return idea;
  },

  async updateIdea(_: any, { id, input }: { id: string; input: any }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const existingIdea = await context.prisma.idea.findUnique({
      where: { id },
    });

    if (!existingIdea) {
      throw new NotFoundError('Idea not found');
    }

    // Recalculate score if scoring fields changed
    let score = existingIdea.score;
    if (input.impact || input.effort || input.strategicFit) {
      const impact = input.impact || existingIdea.impact;
      const effort = input.effort || existingIdea.effort;
      const strategicFit = input.strategicFit || existingIdea.strategicFit;
      score = (impact * strategicFit) / effort;
    }

    const idea = await context.prisma.idea.update({
      where: { id },
      data: {
        ...input,
        score,
        updatedAt: new Date(),
      },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'UPDATED',
      description: `Idea "${idea.title}" was updated`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
      metadata: { changes: input },
    });

    // Publish event
    await context.eventPublisher.publishIdeaEvent('idea.updated', idea);

    // Send WebSocket update
    context.wsManager.broadcast('ideaUpdated', idea);

    return idea;
  },

  async deleteIdea(_: any, { id }: { id: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const idea = await context.prisma.idea.findUnique({
      where: { id },
    });

    if (!idea) {
      throw new NotFoundError('Idea not found');
    }

    // Check if user has permission to delete
    const isOwner = idea.ownerId === context.user.dbUser.id;
    const isAdmin = context.user.dbUser.role === 'admin';
    
    if (!isOwner && !isAdmin) {
      throw new BusinessLogicError('Only the owner or admin can delete an idea');
    }

    // Soft delete by marking as killed
    await context.prisma.idea.update({
      where: { id },
      data: {
        gate: 'KILLED',
        killedAt: new Date(),
        killedReason: 'Deleted by user',
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'UPDATED',
      description: `Idea "${idea.title}" was deleted`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    return true;
  },

  // Stage gate mutations
  async promoteGate(_: any, { input }: { input: any }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const stageGateService = new StageGateService(context.prisma, context.eventPublisher);
    const idea = await stageGateService.promoteGate(
      input.ideaId,
      input.targetGate,
      context.user.dbUser.id,
      {
        comments: input.reviewComments,
        artifactsValidated: input.artifactsValidated,
        overrideChecks: input.overrideChecks,
      }
    );

    // Send WebSocket update
    context.wsManager.broadcast('gatePromoted', idea);

    return idea;
  },

  async rejectGate(_: any, { ideaId, reason }: { ideaId: string; reason: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const stageGateService = new StageGateService(context.prisma, context.eventPublisher);
    const idea = await stageGateService.rejectGate(ideaId, reason, context.user.dbUser.id);

    return idea;
  },

  async killIdea(_: any, { ideaId, reason }: { ideaId: string; reason: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const idea = await context.prisma.idea.update({
      where: { id: ideaId },
      data: {
        gate: 'KILLED',
        killedAt: new Date(),
        killedReason: reason,
      },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'UPDATED',
      description: `Idea "${idea.title}" was killed: ${reason}`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    // Publish event
    await context.eventPublisher.publishIdeaEvent('idea.killed', idea);

    return idea;
  },

  async parkIdea(_: any, { ideaId, reason }: { ideaId: string; reason: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const idea = await context.prisma.idea.update({
      where: { id: ideaId },
      data: {
        gate: 'PARKED',
        parkedAt: new Date(),
        parkedReason: reason,
      },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'UPDATED',
      description: `Idea "${idea.title}" was parked: ${reason}`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    // Publish event
    await context.eventPublisher.publishIdeaEvent('idea.parked', idea);

    return idea;
  },

  // Assignment mutations
  async assignOwner(_: any, { ideaId, userId }: { ideaId: string; userId: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const idea = await context.prisma.idea.update({
      where: { id: ideaId },
      data: { ownerId: userId },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'ASSIGNED',
      description: `Idea "${idea.title}" was assigned to ${idea.owner?.name}`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    return idea;
  },

  async assignPod(_: any, { ideaId, pod }: { ideaId: string; pod: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const idea = await context.prisma.idea.update({
      where: { id: ideaId },
      data: { pod },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Check WIP limits after assignment
    const wipService = new WipLimitService(context.prisma, context.eventPublisher);
    await wipService.checkLimits(pod, idea.gate);

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'ASSIGNED',
      description: `Idea "${idea.title}" was assigned to pod ${pod}`,
      ideaId: idea.id,
      userId: context.user.dbUser.id,
    });

    return idea;
  },

  // Decision memo mutations
  async createDecisionMemo(_: any, { input }: { input: any }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const memo = await context.prisma.decisionMemo.create({
      data: {
        ...input,
        authorId: context.user.dbUser.id,
      },
      include: {
        author: true,
        idea: true,
        votes: { include: { user: true } },
      },
    });

    return memo;
  },

  async voteDecisionMemo(_: any, { input }: { input: any }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    // Create or update vote
    const vote = await context.prisma.memoVote.upsert({
      where: {
        memoId_userId: {
          memoId: input.decisionMemoId,
          userId: context.user.dbUser.id,
        },
      },
      update: {
        vote: input.vote,
        comments: input.comments,
      },
      create: {
        memoId: input.decisionMemoId,
        userId: context.user.dbUser.id,
        vote: input.vote,
        comments: input.comments,
      },
    });

    // Return updated memo
    const memo = await context.prisma.decisionMemo.findUnique({
      where: { id: input.decisionMemoId },
      include: {
        author: true,
        idea: true,
        votes: { include: { user: true } },
      },
    });

    return memo;
  },

  // Review mutations
  async submitReview(_: any, args: any, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const { ideaId, gate, approved, comments } = args;

    const review = await context.prisma.review.create({
      data: {
        ideaId,
        gate,
        status: approved ? 'approved' : 'rejected',
        comments,
        reviewerId: context.user.dbUser.id,
        artifactsValid: approved,
      },
      include: {
        reviewer: true,
        idea: true,
      },
    });

    // Create activity log
    const activityService = new ActivityService(context.prisma, context.eventPublisher);
    await activityService.logActivity({
      type: 'REVIEWED',
      description: `Review ${approved ? 'approved' : 'rejected'} for ${gate} gate`,
      ideaId,
      userId: context.user.dbUser.id,
    });

    return review;
  },

  // Notification mutations
  async markNotificationRead(_: any, { id }: { id: string }, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    const notification = await context.prisma.notification.update({
      where: { id },
      data: { isRead: true },
      include: { idea: true },
    });

    return notification;
  },

  async markAllNotificationsRead(_: any, __: any, context: Context) {
    if (!context.user?.dbUser) {
      throw new AuthenticationError();
    }

    await context.prisma.notification.updateMany({
      where: {
        userId: context.user.dbUser.id,
        isRead: false,
      },
      data: { isRead: true },
    });

    return true;
  },

  // Admin mutations
  async updateWipLimits(_: any, { type, limits }: { type: string; limits: any }, context: Context) {
    if (!context.user?.dbUser || context.user.dbUser.role !== 'admin') {
      throw new AuthenticationError('Admin access required');
    }

    const wipService = new WipLimitService(context.prisma, context.eventPublisher);
    return await wipService.updateLimits(type, limits);
  },

  async recalculateMetrics(_: any, __: any, context: Context) {
    if (!context.user?.dbUser || context.user.dbUser.role !== 'admin') {
      throw new AuthenticationError('Admin access required');
    }

    // Trigger metrics recalculation
    // This would be implemented as a background job in production
    return {
      totalIdeas: 0,
      activeIdeas: 0,
      gateDistribution: [],
      podHealth: [],
      velocity: 0,
      qualityTrend: [],
      wipUtilization: 0,
      lastUpdated: new Date(),
    };
  },

  async triggerAutomation(_: any, { type, ideaId }: { type: string; ideaId?: string }, context: Context) {
    if (!context.user?.dbUser || context.user.dbUser.role !== 'admin') {
      throw new AuthenticationError('Admin access required');
    }

    // Trigger automation workflows
    // This would integrate with GitHub Actions or other automation systems
    context.logger.info('Automation triggered', { type, ideaId, userId: context.user.dbUser.id });

    return true;
  },
};