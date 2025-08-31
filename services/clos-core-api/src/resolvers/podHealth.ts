import { Context } from '../context';

export const podHealthResolvers = {
  wipLimits: async (parent: any, _: any, context: Context) => {
    return await context.prisma.wipLimit.findMany({
      where: {
        type: 'per_pod',
        pod: parent.pod,
      },
      orderBy: { gate: 'asc' },
    });
  },
};