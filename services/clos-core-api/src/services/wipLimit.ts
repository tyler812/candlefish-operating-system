import { PrismaClient, WipLimit, StageGate, Pod } from '@prisma/client';
import { BusinessLogicError } from '../middleware/error';
import { EventPublisher } from '../events/publisher';
import { wipLogger as logger } from '../utils/logger';

interface WipLimitConfig {
  per_pod: Record<StageGate, number>;
  per_person: {
    owned: number;
    involved: number;
  };
  cross_pod: Record<StageGate, number>;
  portfolio: {
    total_active: number;
  };
}

export class WipLimitService {
  private defaultConfig: WipLimitConfig;

  constructor(
    private prisma: PrismaClient,
    private eventPublisher: EventPublisher
  ) {
    this.defaultConfig = {
      per_pod: {
        'SPARK': 10,
        'SEED': 5,
        'SCAFFOLD': 3,
        'SHIP': 2,
        'SCALE': 1,
        'KILLED': 999,
        'PARKED': 999,
      },
      per_person: {
        owned: 2,
        involved: 4,
      },
      cross_pod: {
        'SPARK': 50,
        'SEED': 25,
        'SCAFFOLD': 15,
        'SHIP': 10,
        'SCALE': 5,
        'KILLED': 999,
        'PARKED': 999,
      },
      portfolio: {
        total_active: 100,
      },
    };
  }

  async initializeLimits(): Promise<void> {
    logger.info('Initializing WIP limits');

    // Initialize per-pod limits
    for (const [gate, limit] of Object.entries(this.defaultConfig.per_pod)) {
      for (const pod of Object.values(Pod)) {
        await this.prisma.wipLimit.upsert({
          where: {
            type_gate_pod: {
              type: 'per_pod',
              gate: gate as StageGate,
              pod: pod,
            },
          },
          update: {},
          create: {
            type: 'per_pod',
            gate: gate as StageGate,
            pod: pod,
            limit,
            current: 0,
          },
        });
      }
    }

    // Initialize cross-pod limits
    for (const [gate, limit] of Object.entries(this.defaultConfig.cross_pod)) {
      await this.prisma.wipLimit.upsert({
        where: {
          type_gate_pod: {
            type: 'cross_pod',
            gate: gate as StageGate,
            pod: null,
          },
        },
        update: {},
        create: {
          type: 'cross_pod',
          gate: gate as StageGate,
          limit,
          current: 0,
        },
      });
    }

    // Initialize per-person limits
    await this.prisma.wipLimit.upsert({
      where: {
        type_gate_pod: {
          type: 'per_person',
          gate: null,
          pod: null,
        },
      },
      update: {},
      create: {
        type: 'per_person',
        limit: this.defaultConfig.per_person.owned,
        current: 0,
      },
    });

    // Initialize portfolio limit
    await this.prisma.wipLimit.upsert({
      where: {
        type_gate_pod: {
          type: 'portfolio',
          gate: null,
          pod: null,
        },
      },
      update: {},
      create: {
        type: 'portfolio',
        limit: this.defaultConfig.portfolio.total_active,
        current: 0,
      },
    });

    logger.info('WIP limits initialized successfully');
  }

  async checkLimits(pod: Pod | null, gate: StageGate): Promise<void> {
    logger.debug('Checking WIP limits', { pod, gate });

    const violations: string[] = [];

    // Check per-pod limits
    if (pod) {
      const podLimit = await this.getPodLimit(pod, gate);
      if (podLimit && podLimit.current >= podLimit.limit) {
        violations.push(`Pod ${pod} WIP limit exceeded for ${gate} gate (${podLimit.current}/${podLimit.limit})`);
      }
    }

    // Check cross-pod limits
    const crossPodLimit = await this.getCrossPodLimit(gate);
    if (crossPodLimit && crossPodLimit.current >= crossPodLimit.limit) {
      violations.push(`Cross-pod WIP limit exceeded for ${gate} gate (${crossPodLimit.current}/${crossPodLimit.limit})`);
    }

    // Check portfolio limit
    const portfolioLimit = await this.getPortfolioLimit();
    if (portfolioLimit && portfolioLimit.current >= portfolioLimit.limit) {
      violations.push(`Portfolio WIP limit exceeded (${portfolioLimit.current}/${portfolioLimit.limit})`);
    }

    if (violations.length > 0) {
      throw new BusinessLogicError(`WIP limit violations:\n${violations.join('\n')}`);
    }
  }

  async updateCounts(): Promise<void> {
    logger.debug('Updating WIP limit counts');

    // Update per-pod counts
    for (const pod of Object.values(Pod)) {
      for (const gate of Object.values(StageGate)) {
        if (gate === 'KILLED' || gate === 'PARKED') continue;

        const count = await this.prisma.idea.count({
          where: {
            pod,
            gate,
          },
        });

        await this.prisma.wipLimit.updateMany({
          where: {
            type: 'per_pod',
            pod,
            gate,
          },
          data: {
            current: count,
            isExceeded: count >= await this.getLimit('per_pod', gate, pod),
            lastUpdated: new Date(),
          },
        });
      }
    }

    // Update cross-pod counts
    for (const gate of Object.values(StageGate)) {
      if (gate === 'KILLED' || gate === 'PARKED') continue;

      const count = await this.prisma.idea.count({
        where: { gate },
      });

      await this.prisma.wipLimit.updateMany({
        where: {
          type: 'cross_pod',
          gate,
        },
        data: {
          current: count,
          isExceeded: count >= await this.getLimit('cross_pod', gate),
          lastUpdated: new Date(),
        },
      });
    }

    // Update portfolio count
    const totalActive = await this.prisma.idea.count({
      where: {
        gate: {
          notIn: ['KILLED', 'PARKED'],
        },
      },
    });

    await this.prisma.wipLimit.updateMany({
      where: { type: 'portfolio' },
      data: {
        current: totalActive,
        isExceeded: totalActive >= await this.getLimit('portfolio'),
        lastUpdated: new Date(),
      },
    });

    // Check for new violations and send notifications
    await this.checkForViolations();

    logger.debug('WIP limit counts updated');
  }

  private async checkForViolations(): Promise<void> {
    const violations = await this.prisma.wipLimit.findMany({
      where: {
        isExceeded: true,
      },
    });

    for (const violation of violations) {
      await this.eventPublisher.publishWipEvent('wip_limit.exceeded', {
        type: violation.type,
        gate: violation.gate,
        pod: violation.pod,
        current: violation.current,
        limit: violation.limit,
        timestamp: new Date(),
      });

      // Send notifications to relevant stakeholders
      await this.sendWipViolationNotifications(violation);
    }
  }

  private async sendWipViolationNotifications(violation: WipLimit): Promise<void> {
    let message = `WIP limit exceeded: ${violation.type}`;
    
    if (violation.pod) {
      message += ` for ${violation.pod} pod`;
    }
    if (violation.gate) {
      message += ` in ${violation.gate} gate`;
    }
    message += ` (${violation.current}/${violation.limit})`;

    // Find relevant users to notify
    let userIds: string[] = [];

    if (violation.pod) {
      // Notify pod members
      const podUsers = await this.prisma.user.findMany({
        where: {
          pod: violation.pod,
          isActive: true,
        },
        select: { id: true },
      });
      userIds = podUsers.map(u => u.id);
    } else {
      // Notify all active users for portfolio limits
      const allUsers = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      userIds = allUsers.map(u => u.id);
    }

    // Create notifications
    for (const userId of userIds) {
      await this.prisma.notification.create({
        data: {
          type: 'WIP_LIMIT_EXCEEDED',
          title: 'WIP Limit Exceeded',
          message,
          userId,
          metadata: {
            wipLimitId: violation.id,
            type: violation.type,
            gate: violation.gate,
            pod: violation.pod,
          },
        },
      });
    }
  }

  async getAllLimits(): Promise<WipLimit[]> {
    return await this.prisma.wipLimit.findMany({
      orderBy: [
        { type: 'asc' },
        { pod: 'asc' },
        { gate: 'asc' },
      ],
    });
  }

  async getPodLimit(pod: Pod, gate: StageGate): Promise<WipLimit | null> {
    return await this.prisma.wipLimit.findFirst({
      where: {
        type: 'per_pod',
        pod,
        gate,
      },
    });
  }

  async getCrossPodLimit(gate: StageGate): Promise<WipLimit | null> {
    return await this.prisma.wipLimit.findFirst({
      where: {
        type: 'cross_pod',
        gate,
      },
    });
  }

  async getPortfolioLimit(): Promise<WipLimit | null> {
    return await this.prisma.wipLimit.findFirst({
      where: { type: 'portfolio' },
    });
  }

  private async getLimit(type: string, gate?: StageGate, pod?: Pod): Promise<number> {
    const wipLimit = await this.prisma.wipLimit.findFirst({
      where: { type, gate, pod },
    });
    
    return wipLimit?.limit || 999; // Default to high limit if not found
  }

  async updateLimits(type: string, limits: any): Promise<WipLimit[]> {
    logger.info('Updating WIP limits', { type, limits });

    const updatedLimits: WipLimit[] = [];

    for (const [key, limit] of Object.entries(limits)) {
      let where: any = { type };
      
      if (type === 'per_pod') {
        const [gate, pod] = key.split(':');
        where.gate = gate;
        where.pod = pod;
      } else if (type === 'cross_pod') {
        where.gate = key;
      }

      const updated = await this.prisma.wipLimit.updateMany({
        where,
        data: {
          limit: limit as number,
          lastUpdated: new Date(),
        },
      });

      if (updated.count > 0) {
        const wipLimit = await this.prisma.wipLimit.findFirst({ where });
        if (wipLimit) {
          updatedLimits.push(wipLimit);
        }
      }
    }

    // Recalculate counts and check for new violations
    await this.updateCounts();

    logger.info('WIP limits updated successfully', { count: updatedLimits.length });

    return updatedLimits;
  }

  async getLimitUtilization(): Promise<Record<string, number>> {
    const limits = await this.getAllLimits();
    
    const utilization: Record<string, number> = {};
    
    for (const limit of limits) {
      const key = `${limit.type}${limit.gate ? `:${limit.gate}` : ''}${limit.pod ? `:${limit.pod}` : ''}`;
      utilization[key] = limit.limit > 0 ? (limit.current / limit.limit) * 100 : 0;
    }
    
    return utilization;
  }
}