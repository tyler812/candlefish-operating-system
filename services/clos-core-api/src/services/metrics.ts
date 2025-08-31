import { PrismaClient, StageGate, Pod } from '@prisma/client';
import { logger } from '../utils/logger';

export class MetricsService {
  constructor(private prisma: PrismaClient) {}

  async getPortfolioMetrics(): Promise<any> {
    try {
      // Get basic counts
      const totalIdeas = await this.prisma.idea.count();
      const activeIdeas = await this.prisma.idea.count({
        where: {
          gate: { notIn: ['KILLED', 'PARKED'] },
        },
      });

      // Get gate distribution
      const gateDistribution = await this.prisma.idea.groupBy({
        by: ['gate'],
        _count: { gate: true },
        where: {
          gate: { not: 'KILLED' },
        },
      });

      // Calculate velocity (ideas promoted in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentPromotions = await this.prisma.activity.count({
        where: {
          type: 'GATE_CHANGED',
          createdAt: { gte: thirtyDaysAgo },
        },
      });

      const velocity = recentPromotions / 30; // per day

      // Get pod health
      const podHealth = await this.getPodHealth();

      // Calculate WIP utilization
      const wipLimits = await this.prisma.wipLimit.findMany();
      const totalCapacity = wipLimits.reduce((sum, limit) => sum + limit.limit, 0);
      const totalUsed = wipLimits.reduce((sum, limit) => sum + limit.current, 0);
      const wipUtilization = totalCapacity > 0 ? (totalUsed / totalCapacity) * 100 : 0;

      return {
        totalIdeas,
        activeIdeas,
        gateDistribution: gateDistribution.map(g => ({
          gate: g.gate,
          count: g._count.gate,
          averageTimeInGate: 0, // TODO: Calculate actual time
          promotionRate: 0, // TODO: Calculate actual rate
          killRate: 0, // TODO: Calculate actual rate
          slaViolations: 0, // TODO: Calculate actual violations
        })),
        podHealth,
        velocity,
        qualityTrend: [], // TODO: Implement quality trending
        wipUtilization,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get portfolio metrics', error);
      throw error;
    }
  }

  async getPodHealth(pod?: string): Promise<any[]> {
    const pods = pod ? [pod as Pod] : Object.values(Pod);
    const podHealthData = [];

    for (const podName of pods) {
      const activeIdeas = await this.prisma.idea.count({
        where: {
          pod: podName,
          gate: { notIn: ['KILLED', 'PARKED'] },
        },
      });

      const wipLimits = await this.prisma.wipLimit.findMany({
        where: {
          type: 'per_pod',
          pod: podName,
        },
      });

      // Calculate velocity for this pod
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const podPromotions = await this.prisma.activity.count({
        where: {
          type: 'GATE_CHANGED',
          createdAt: { gte: thirtyDaysAgo },
          idea: { pod: podName },
        },
      });

      const velocity = podPromotions / 30;

      podHealthData.push({
        pod: podName,
        activeIdeas,
        wipLimits,
        velocity,
        qualityScore: 85, // TODO: Implement quality scoring
        slaViolations: 0, // TODO: Calculate actual SLA violations
        lastUpdated: new Date(),
      });
    }

    return podHealthData;
  }

  async getStageGateMetrics(): Promise<any[]> {
    const gates = Object.values(StageGate).filter(g => g !== 'KILLED');
    const metrics = [];

    for (const gate of gates) {
      const count = await this.prisma.idea.count({
        where: { gate },
      });

      // Calculate average time in gate
      const ideasInGate = await this.prisma.idea.findMany({
        where: { gate },
        select: { createdAt: true, updatedAt: true },
      });

      let averageTime = 0;
      if (ideasInGate.length > 0) {
        const totalTime = ideasInGate.reduce((sum, idea) => {
          return sum + (idea.updatedAt.getTime() - idea.createdAt.getTime());
        }, 0);
        averageTime = totalTime / ideasInGate.length / (1000 * 60 * 60 * 24); // days
      }

      metrics.push({
        gate,
        count,
        averageTimeInGate: averageTime,
        promotionRate: 0, // TODO: Calculate promotion rate
        killRate: 0, // TODO: Calculate kill rate
        slaViolations: 0, // TODO: Calculate SLA violations
      });
    }

    return metrics;
  }

  async getVelocityReport(pod?: string, timeframe = '30d'): Promise<any> {
    const days = parseInt(timeframe.replace('d', ''), 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereClause: any = {
      type: 'GATE_CHANGED',
      createdAt: { gte: startDate },
    };

    if (pod) {
      whereClause.idea = { pod };
    }

    const promotions = await this.prisma.activity.findMany({
      where: whereClause,
      include: { idea: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const dailyPromotions: Record<string, number> = {};
    promotions.forEach(promotion => {
      const day = promotion.createdAt.toISOString().split('T')[0];
      dailyPromotions[day] = (dailyPromotions[day] || 0) + 1;
    });

    return {
      timeframe,
      pod,
      totalPromotions: promotions.length,
      averagePerDay: promotions.length / days,
      dailyBreakdown: dailyPromotions,
      trendDirection: this.calculateTrend(Object.values(dailyPromotions)),
    };
  }

  async getQualityReport(timeframe = '30d'): Promise<any> {
    const days = parseInt(timeframe.replace('d', ''), 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get ideas that were killed or had rejections
    const failedIdeas = await this.prisma.idea.count({
      where: {
        OR: [
          { gate: 'KILLED', killedAt: { gte: startDate } },
          { gate: 'PARKED', parkedAt: { gte: startDate } },
        ],
      },
    });

    const totalIdeas = await this.prisma.idea.count({
      where: {
        createdAt: { gte: startDate },
      },
    });

    const rejectedReviews = await this.prisma.review.count({
      where: {
        status: 'rejected',
        createdAt: { gte: startDate },
      },
    });

    const totalReviews = await this.prisma.review.count({
      where: {
        createdAt: { gte: startDate },
      },
    });

    const successRate = totalIdeas > 0 ? ((totalIdeas - failedIdeas) / totalIdeas) * 100 : 100;
    const approvalRate = totalReviews > 0 ? ((totalReviews - rejectedReviews) / totalReviews) * 100 : 100;

    return {
      timeframe,
      successRate,
      approvalRate,
      failedIdeas,
      totalIdeas,
      rejectedReviews,
      totalReviews,
      qualityScore: (successRate + approvalRate) / 2,
    };
  }

  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    
    if (Math.abs(diff) < 0.1) return 'stable';
    return diff > 0 ? 'up' : 'down';
  }
}