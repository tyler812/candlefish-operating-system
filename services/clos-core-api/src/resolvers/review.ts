import { Context } from '../context';

export const reviewResolvers = {
  idea: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.ideaById.load(parent.ideaId);
  },

  reviewer: async (parent: any, _: any, context: Context) => {
    return await context.dataloaders.userById.load(parent.reviewerId);
  },
};