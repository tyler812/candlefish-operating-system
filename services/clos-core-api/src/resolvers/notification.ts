import { Context } from '../context';

export const notificationResolvers = {
  user: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.userById.load(parent.userId);
  },

  idea: async (parent: any, _: any, context: Context) => {
    if (!parent.ideaId) return null;
    return await context.dataloaders.ideaById.load(parent.ideaId);
  },
};