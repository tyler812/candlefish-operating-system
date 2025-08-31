import { Context } from '../context';

export const userResolvers = {
  ownedIdeas: async (parent: any, _: any, context: Context) => {
    return await context.prisma.idea.findMany({
      where: { ownerId: parent.id },
      orderBy: { updatedAt: 'desc' },
    });
  },

  assignedIdeas: async (parent: any, _: any, context: Context) => {
    return await context.prisma.idea.findMany({
      where: {
        assignees: {
          some: { id: parent.id },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  activities: async (parent: any, _: any, context: Context) => {
    return await context.prisma.activity.findMany({
      where: { userId: parent.id },
      include: { idea: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  },

  decisionMemos: async (parent: any, _: any, context: Context) => {
    return await context.prisma.decisionMemo.findMany({
      where: { authorId: parent.id },
      include: { idea: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};