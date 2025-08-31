import { Context } from '../context';

export const decisionMemoResolvers = {
  idea: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.ideaById.load(parent.ideaId);
  },

  author: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.userById.load(parent.authorId);
  },

  votes: async (parent: any, _: any, context: Context) => {
    return await context.prisma.memoVote.findMany({
      where: { memoId: parent.id },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};