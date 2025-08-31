import { Context } from '../context';

export const ideaResolvers = {
  // Field resolvers
  owner: async (parent: any, _: any, context: Context) => {
    if (!parent.ownerId) return null;
    return await context.dataloaders.userById.load(parent.ownerId);
  },

  assignees: async (parent: any, _: any, context: Context) => {
    // This would typically be handled by Prisma include, but showing dataloader pattern
    return parent.assignees || [];
  },

  activities: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.activitiesByIdeaId.load(parent.id);
  },

  reviews: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.reviewsByIdeaId.load(parent.id);
  },

  decisionMemo: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.decisionMemoByIdeaId.load(parent.id);
  },

  wipLimits: async (parent: any, _: any, context: Context) => {
    if (!parent.pod || !parent.gate) return [];
    
    return await context.prisma.wipLimit.findMany({
      where: {
        OR: [
          { type: 'per_pod', pod: parent.pod, gate: parent.gate },
          { type: 'cross_pod', gate: parent.gate },
          { type: 'portfolio' },
        ],
      },
    });
  },
};