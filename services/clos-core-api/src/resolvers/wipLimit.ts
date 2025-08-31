import { Context } from '../context';

export const wipLimitResolvers = {
  ideas: async (parent: any, _: any, context: Context) => {
    const whereClause: any = {
      gate: { not: 'KILLED' },
    };

    if (parent.type === 'per_pod' && parent.pod && parent.gate) {
      whereClause.pod = parent.pod;
      whereClause.gate = parent.gate;
    } else if (parent.type === 'cross_pod' && parent.gate) {
      whereClause.gate = parent.gate;
    } else if (parent.type === 'portfolio') {
      whereClause.gate = { notIn: ['KILLED', 'PARKED'] };
    }

    return await context.prisma.idea.findMany({
      where: whereClause,
      include: { owner: true },
      orderBy: { updatedAt: 'desc' },
    });
  },
};