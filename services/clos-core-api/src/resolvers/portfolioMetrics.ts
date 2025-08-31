import { Context } from '../context';

export const portfolioMetricsResolvers = {
  gateDistribution: async (parent: any, _: any, context: Context) => {
    return parent.gateDistribution || [];
  },

  podHealth: async (parent: any, _: any, context: Context) => {
    return parent.podHealth || [];
  },
};