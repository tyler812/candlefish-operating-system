import { Context } from '../context';

export const activityResolvers = {
  idea: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.ideaById.load(parent.ideaId);
  },

  user: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.userById.load(parent.userId);
  },
};