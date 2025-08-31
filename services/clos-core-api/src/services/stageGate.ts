import { PrismaClient, StageGate, Idea } from '@prisma/client';
import { BusinessLogicError } from '../middleware/error';
import { EventPublisher } from '../events/publisher';
import { stageGateLogger as logger } from '../utils/logger';

interface StageGateConfig {
  name: string;
  description: string;
  entryCriteria: string[];
  exitCriteria: string[];
  requiredArtifacts: string[];
  reviewers: { role: string; required: boolean }[];
  sla: string;
}

interface PromotionOptions {
  comments?: string;
  artifactsValidated?: boolean;
  overrideChecks?: boolean;
}

export class StageGateService {
  private stageGateConfig: Map<StageGate, StageGateConfig>;

  constructor(
    private prisma: PrismaClient,
    private eventPublisher: EventPublisher
  ) {
    this.stageGateConfig = this.initializeStageGates();
  }

  private initializeStageGates(): Map<StageGate, StageGateConfig> {
    const config = new Map<StageGate, StageGateConfig>();

    config.set('SPARK', {
      name: 'Spark',
      description: 'Idea capture and qualification',
      entryCriteria: ['problem_statement_exists', 'hypothesis_defined', 'idea_ledger_entry'],
      exitCriteria: ['strategic_fit_score_gte_3', 'impact_score_gte_3', 'feasibility_check_completed'],
      requiredArtifacts: ['idea_ledger_entry', 'initial_pov'],
      reviewers: [
        { role: 'pod_lead', required: false },
        { role: 'integrator_pod', required: true },
      ],
      sla: '7 days',
    });

    config.set('SEED', {
      name: 'Seed',
      description: 'Feasibility validation and planning',
      entryCriteria: ['spark_gate_passed', 'owner_assigned', 'pod_identified'],
      exitCriteria: ['technical_feasibility_proven', 'dependencies_identified', 'risk_assessment_completed'],
      requiredArtifacts: ['technical_spike', 'dependency_map', 'decision_memo'],
      reviewers: [
        { role: 'integrator_pod', required: true },
        { role: 'technical_lead', required: true },
        { role: 'patrick', required: false },
      ],
      sla: '14 days',
    });

    config.set('SCAFFOLD', {
      name: 'Scaffold',
      description: 'Build core functionality',
      entryCriteria: ['seed_gate_passed', 'acceptance_criteria_defined', 'api_contracts_drafted'],
      exitCriteria: ['core_features_complete', 'test_coverage_60_percent', 'demo_approved'],
      requiredArtifacts: ['core_implementation', 'test_suite', 'api_documentation', 'demo_recording'],
      reviewers: [
        { role: 'pod_lead', required: true },
        { role: 'qa_engineer', required: false },
        { role: 'design_lead', required: false },
      ],
      sla: '21 days',
    });

    config.set('SHIP', {
      name: 'Ship',
      description: 'Polish and production release',
      entryCriteria: ['scaffold_gate_passed', 'minimum_remarkable_checklist_started', 'deployment_plan_exists'],
      exitCriteria: ['production_deployed', 'monitoring_active', 'documentation_complete'],
      requiredArtifacts: ['production_code', 'minimum_remarkable_checklist', 'release_notes', 'support_runbook'],
      reviewers: [
        { role: 'integrator_pod', required: true },
        { role: 'portfolio_council', required: true },
        { role: 'patrick', required: true },
      ],
      sla: '7 days',
    });

    config.set('SCALE', {
      name: 'Scale',
      description: 'Optimize and expand',
      entryCriteria: ['ship_gate_passed', 'stability_period_30_days', 'usage_metrics_baseline'],
      exitCriteria: ['performance_targets_met', 'operational_maturity_l2', 'team_onboarded'],
      requiredArtifacts: ['optimization_report', 'scaling_plan', 'operational_handoff'],
      reviewers: [
        { role: 'operations_lead', required: true },
        { role: 'portfolio_council', required: false },
      ],
      sla: 'ongoing',
    });

    return config;
  }

  async promoteGate(
    ideaId: string,
    targetGate: StageGate,
    userId: string,
    options: PromotionOptions = {}
  ): Promise<Idea> {
    logger.info('Attempting gate promotion', { ideaId, targetGate, userId });

    // Get current idea
    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      include: { owner: true, reviews: true },
    });

    if (!idea) {
      throw new BusinessLogicError('Idea not found');
    }

    // Validate gate sequence
    const currentGate = idea.gate;
    if (!this.isValidGateTransition(currentGate, targetGate)) {
      throw new BusinessLogicError(
        `Invalid gate transition from ${currentGate} to ${targetGate}`
      );
    }

    // Check WIP limits
    await this.checkWipLimits(idea.pod, targetGate);

    // Validate gate criteria (unless override is specified)
    if (!options.overrideChecks) {
      await this.validateGateCriteria(idea, targetGate);
    }

    // Create promotion record
    const review = await this.prisma.review.create({
      data: {
        ideaId,
        gate: targetGate,
        status: 'approved',
        comments: options.comments,
        artifactsValid: options.artifactsValidated || false,
        reviewerId: userId,
        criteriaMetMap: {}, // Would contain actual criteria validation results
      },
    });

    // Update idea gate
    const updatedIdea = await this.prisma.idea.update({
      where: { id: ideaId },
      data: {
        gate: targetGate,
        nextReview: this.calculateNextReviewDate(targetGate),
        updatedAt: new Date(),
      },
      include: {
        owner: true,
        assignees: true,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'GATE_CHANGED',
        description: `Gate promoted from ${currentGate} to ${targetGate}`,
        ideaId,
        userId,
        metadata: {
          fromGate: currentGate,
          toGate: targetGate,
          reviewId: review.id,
        },
      },
    });

    // Publish events
    await this.eventPublisher.publishStageGateEvent('gate.promoted', {
      ideaId,
      fromGate: currentGate,
      toGate: targetGate,
      userId,
      timestamp: new Date(),
    });

    // Send notifications
    await this.sendGatePromotionNotifications(updatedIdea, currentGate, targetGate, userId);

    logger.info('Gate promotion successful', { ideaId, fromGate: currentGate, toGate: targetGate });

    return updatedIdea;
  }

  async rejectGate(ideaId: string, reason: string, userId: string): Promise<Idea> {
    logger.info('Rejecting gate promotion', { ideaId, reason, userId });

    const idea = await this.prisma.idea.findUnique({
      where: { id: ideaId },
      include: { owner: true },
    });

    if (!idea) {
      throw new BusinessLogicError('Idea not found');
    }

    // Create rejection record
    await this.prisma.review.create({
      data: {
        ideaId,
        gate: idea.gate,
        status: 'rejected',
        comments: reason,
        reviewerId: userId,
        artifactsValid: false,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        type: 'GATE_CHANGED',
        description: `Gate promotion rejected: ${reason}`,
        ideaId,
        userId,
        metadata: { reason },
      },
    });

    // Publish event
    await this.eventPublisher.publishStageGateEvent('gate.rejected', {
      ideaId,
      gate: idea.gate,
      reason,
      userId,
      timestamp: new Date(),
    });

    // Send notifications
    await this.sendGateRejectionNotifications(idea, reason, userId);

    return idea;
  }

  private isValidGateTransition(currentGate: StageGate, targetGate: StageGate): boolean {
    const gateOrder: StageGate[] = ['SPARK', 'SEED', 'SCAFFOLD', 'SHIP', 'SCALE'];
    
    // Can always go to KILLED or PARKED
    if (targetGate === 'KILLED' || targetGate === 'PARKED') {
      return true;
    }
    
    // Can resurrect from PARKED to any gate
    if (currentGate === 'PARKED') {
      return gateOrder.includes(targetGate);
    }
    
    // Can't resurrect from KILLED
    if (currentGate === 'KILLED') {
      return false;
    }
    
    const currentIndex = gateOrder.indexOf(currentGate);
    const targetIndex = gateOrder.indexOf(targetGate);
    
    // Can only move forward one gate at a time, or backward
    return targetIndex === currentIndex + 1 || targetIndex < currentIndex;
  }

  private async checkWipLimits(pod: string | null, gate: StageGate): Promise<void> {
    if (!pod) return;

    const activeIdeasInGate = await this.prisma.idea.count({
      where: {
        pod,
        gate,
        gate: { not: 'KILLED' },
      },
    });

    // Get WIP limits for this pod/gate combination
    const wipLimit = await this.prisma.wipLimit.findFirst({
      where: {
        type: 'per_pod',
        pod,
        gate,
      },
    });

    if (wipLimit && activeIdeasInGate >= wipLimit.limit) {
      throw new BusinessLogicError(
        `WIP limit exceeded for ${pod} pod in ${gate} gate (${activeIdeasInGate}/${wipLimit.limit})`
      );
    }
  }

  private async validateGateCriteria(idea: Idea, targetGate: StageGate): Promise<void> {
    const config = this.stageGateConfig.get(targetGate);
    if (!config) return;

    const failures: string[] = [];

    // Check entry criteria
    for (const criterion of config.entryCriteria) {
      const ismet = await this.evaluateCriterion(idea, criterion);
      if (!ismet) {
        failures.push(`Entry criterion not met: ${criterion}`);
      }
    }

    // Check exit criteria for current gate
    const currentConfig = this.stageGateConfig.get(idea.gate);
    if (currentConfig) {
      for (const criterion of currentConfig.exitCriteria) {
        const ismet = await this.evaluateCriterion(idea, criterion);
        if (!ismet) {
          failures.push(`Exit criterion not met for ${idea.gate}: ${criterion}`);
        }
      }
    }

    if (failures.length > 0) {
      throw new BusinessLogicError(`Gate criteria not met:\n${failures.join('\n')}`);
    }
  }

  private async evaluateCriterion(idea: Idea, criterion: string): Promise<boolean> {
    // This would implement actual criterion evaluation logic
    // For now, return basic validations
    switch (criterion) {
      case 'problem_statement_exists':
        return !!idea.problemStatement;
      case 'hypothesis_defined':
        return !!idea.hypothesis;
      case 'strategic_fit_score_gte_3':
        return idea.strategicFit >= 3;
      case 'impact_score_gte_3':
        return idea.impact >= 3;
      default:
        logger.warn('Unknown criterion', { criterion });
        return true; // Default to pass for unknown criteria
    }
  }

  private calculateNextReviewDate(gate: StageGate): Date {
    const now = new Date();
    const slaMap: Record<StageGate, number> = {
      'SPARK': 7,
      'SEED': 14,
      'SCAFFOLD': 21,
      'SHIP': 7,
      'SCALE': 90,
      'KILLED': 0,
      'PARKED': 30,
    };

    const daysToAdd = slaMap[gate] || 7;
    return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  }

  private async sendGatePromotionNotifications(
    idea: Idea,
    fromGate: StageGate,
    toGate: StageGate,
    userId: string
  ): Promise<void> {
    // Create notifications for stakeholders
    const stakeholders = [idea.ownerId].filter(Boolean) as string[];
    
    for (const stakeholderId of stakeholders) {
      if (stakeholderId !== userId) {
        await this.prisma.notification.create({
          data: {
            type: 'GATE_PROMOTION',
            title: 'Idea Gate Promoted',
            message: `"${idea.title}" was promoted from ${fromGate} to ${toGate}`,
            userId: stakeholderId,
            ideaId: idea.id,
          },
        });
      }
    }
  }

  private async sendGateRejectionNotifications(
    idea: Idea,
    reason: string,
    userId: string
  ): Promise<void> {
    if (idea.ownerId && idea.ownerId !== userId) {
      await this.prisma.notification.create({
        data: {
          type: 'GATE_REJECTION',
          title: 'Gate Promotion Rejected',
          message: `"${idea.title}" gate promotion was rejected: ${reason}`,
          userId: idea.ownerId,
          ideaId: idea.id,
        },
      });
    }
  }

  async getGateMetrics(): Promise<any> {
    const metrics = await this.prisma.idea.groupBy({
      by: ['gate'],
      _count: { gate: true },
      where: {
        gate: { not: 'KILLED' },
      },
    });

    return metrics.map(metric => ({
      gate: metric.gate,
      count: metric._count.gate,
      // Additional metrics would be calculated here
      averageTimeInGate: 0,
      promotionRate: 0,
      killRate: 0,
      slaViolations: 0,
    }));
  }
}