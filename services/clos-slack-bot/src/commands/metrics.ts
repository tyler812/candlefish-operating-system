import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatMetrics, createProgressBar } from '../utils/helpers';

export function registerMetricsCommand(app: App): void {
  app.command('/metrics', async ({ command, ack, respond }) => {
    await ack();

    try {
      const user = await closApi.getUser(command.user_id);
      if (!user) {
        await respond({
          text: '❌ User not found in CLOS system. Please contact your administrator.',
          response_type: 'ephemeral'
        });
        return;
      }

      const text = command.text.trim();
      const parts = text.split(' ');
      const target = parts[0].toLowerCase();

      if (!text || target === 'pod') {
        // Show pod metrics
        const podName = parts[1] || user.pod;
        const metrics = await closApi.getPodMetrics(podName);

        const wipBar = createProgressBar(metrics.wipUtilization, 1, 15);
        
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: formatMetrics(metrics)
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*WIP Utilization Trend:*\n${wipBar} ${(metrics.wipUtilization * 100).toFixed(1)}%`
            }
          },
          {
            type: 'divider'
          }
        ];

        // Add performance indicators
        const throughputStatus = metrics.throughput >= 5 ? '🟢 Excellent' : 
                               metrics.throughput >= 3 ? '🟡 Good' : '🔴 Needs Improvement';
        
        const cycleTimeStatus = metrics.cycleTime <= 7 ? '🟢 Fast' : 
                              metrics.cycleTime <= 14 ? '🟡 Moderate' : '🔴 Slow';
        
        const blockerStatus = metrics.blockerCount === 0 ? '🟢 No Blockers' :
                            metrics.blockerCount <= 2 ? '🟡 Few Blockers' : '🔴 Many Blockers';

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Performance Indicators:*
• *Throughput:* ${throughputStatus}
• *Cycle Time:* ${cycleTimeStatus}
• *Blockers:* ${blockerStatus}`
          }
        });

        // Add recommendations based on metrics
        const recommendations = [];
        
        if (metrics.wipUtilization > 0.9) {
          recommendations.push('• Consider completing current projects before starting new ones');
        }
        
        if (metrics.cycleTime > 14) {
          recommendations.push('• Review project scope and break down large tasks');
        }
        
        if (metrics.blockerCount > 2) {
          recommendations.push('• Schedule daily unblock sessions');
          recommendations.push('• Identify recurring blocker patterns');
        }
        
        if (metrics.throughput < 3) {
          recommendations.push('• Analyze process bottlenecks');
          recommendations.push('• Consider workflow optimization');
        }

        if (recommendations.length > 0) {
          blocks.push(
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💡 *Recommendations:*\n${recommendations.join('\n')}`
              }
            }
          );
        }

        // Add action buttons
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Export Report'
                },
                action_id: 'export_pod_metrics',
                value: podName
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Compare Pods'
                },
                action_id: 'compare_all_pods'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Historical Trends'
                },
                action_id: 'show_metrics_trends',
                value: podName
              }
            ]
          }
        );

        await respond({
          text: `Metrics for ${podName}`,
          blocks,
          response_type: command.text.includes('public') ? 'in_channel' : 'ephemeral'
        });

      } else if (target === 'overall' || target === 'company' || target === 'all') {
        // Show overall company metrics
        const overallMetrics = await closApi.getOverallMetrics();
        
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🏢 *Overall Company Metrics*'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: formatMetrics(overallMetrics)
            }
          },
          {
            type: 'divider'
          }
        ];

        // Add health scorecard
        const healthScore = calculateHealthScore(overallMetrics);
        const healthEmoji = healthScore >= 80 ? '🟢' : healthScore >= 60 ? '🟡' : '🔴';
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${healthEmoji} *System Health Score: ${healthScore}/100*\n\n*Key Indicators:*
• WIP Management: ${metrics.wipUtilization <= 0.8 ? '✅' : '⚠️'}
• Delivery Speed: ${metrics.throughput >= 4 ? '✅' : '⚠️'}  
• Cycle Efficiency: ${metrics.cycleTime <= 10 ? '✅' : '⚠️'}
• Innovation Rate: ${metrics.ideasSubmitted >= 10 ? '✅' : '⚠️'}`
          }
        });

        await respond({
          text: `Overall company metrics (Health: ${healthScore}/100)`,
          blocks,
          response_type: command.text.includes('public') ? 'in_channel' : 'ephemeral'
        });

      } else if (target === 'personal' || target === 'my') {
        // Show personal metrics
        const projects = await closApi.getProjects(user.id);
        const ideas = await closApi.getIdeas(undefined, user.id);
        const decisions = await closApi.getDecisions(undefined, user.id);

        const activeProjects = projects.filter(p => p.stage !== 'sunset');
        const blockedProjects = projects.filter(p => p.blockers.length > 0);
        const approvedIdeas = ideas.filter(i => i.status === 'approved');
        const pendingDecisions = decisions.filter(d => d.status === 'review');

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👤 *Personal Metrics for ${user.name}*`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Projects:*
• Active Projects: ${activeProjects.length}
• Blocked Projects: ${blockedProjects.length}
• Completion Rate: ${calculateCompletionRate(projects)}%

*Ideas & Innovation:*
• Ideas Submitted: ${ideas.length}
• Ideas Approved: ${approvedIdeas.length}
• Approval Rate: ${ideas.length > 0 ? Math.round((approvedIdeas.length / ideas.length) * 100) : 0}%

*Decision Making:*
• Decisions Created: ${decisions.length}
• Pending Review: ${pendingDecisions.length}

*Pod: ${user.pod}*`
            }
          }
        ];

        // Add personal recommendations
        const personalRecs = [];
        
        if (blockedProjects.length > 0) {
          personalRecs.push('• Use `/unblock` to resolve project blockers');
        }
        
        if (pendingDecisions.length > 0) {
          personalRecs.push('• Follow up on pending decision approvals');
        }
        
        if (ideas.length === 0) {
          personalRecs.push('• Consider submitting ideas with `/idea`');
        }

        if (personalRecs.length > 0) {
          blocks.push(
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💡 *Personal Action Items:*\n${personalRecs.join('\n')}`
              }
            }
          );
        }

        await respond({
          text: `Your personal metrics`,
          blocks,
          response_type: 'ephemeral'
        });

      } else {
        await respond({
          text: '❌ Unknown metrics command. Use:\n• `/metrics` or `/metrics pod` - Pod metrics\n• `/metrics overall` - Company metrics\n• `/metrics personal` - Your personal metrics',
          response_type: 'ephemeral'
        });
      }

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'viewed_metrics',
        target: target || 'pod',
        metadata: { command: text }
      });

    } catch (error) {
      logger.error('Metrics command error:', error);
      await respond({
        text: '❌ Failed to get metrics. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle metrics action buttons
  app.action('export_pod_metrics', async ({ ack, body, respond }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      const metrics = await closApi.getPodMetrics(podName);
      
      // Generate report (simplified version)
      const report = `# ${podName} Metrics Report
Generated: ${new Date().toISOString()}

## Key Metrics
- WIP Utilization: ${(metrics.wipUtilization * 100).toFixed(1)}%
- Throughput: ${metrics.throughput} items/week
- Cycle Time: ${metrics.cycleTime.toFixed(1)} days
- Active Blockers: ${metrics.blockerCount}
- Ideas Submitted: ${metrics.ideasSubmitted} this month
- Decisions Approved: ${metrics.decisionsApproved} this month

## Health Status
${calculateHealthScore(metrics)}/100

---
Generated by CLOS Slack Bot`;

      await respond({
        text: `📊 *Pod Metrics Report Generated*\n\n\`\`\`${report}\`\`\`\n\n_Full detailed report would be available as a file download in production._`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Export metrics error:', error);
      await respond({
        text: '❌ Failed to export metrics report.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('compare_all_pods', async ({ ack, body, client }) => {
    await ack();

    try {
      // This would require API modification to get all pods
      // For now, show placeholder
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Pod Comparison'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '📊 *All Pods Comparison*\n\n_Feature coming soon - will show side-by-side metrics comparison of all pods including throughput, cycle time, and WIP utilization._'
              }
            }
          ],
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('Compare pods error:', error);
    }
  });

  app.action('show_metrics_trends', async ({ ack, body, client }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Metrics Trends'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📈 *Historical Trends for ${podName}*\n\n_Feature coming soon - will show charts and trends for:_\n\n• WIP utilization over time\n• Throughput trends\n• Cycle time improvements\n• Blocker frequency\n• Idea submission rates\n• Decision velocity`
              }
            }
          ],
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('Show trends error:', error);
    }
  });
}

function calculateHealthScore(metrics: any): number {
  let score = 100;
  
  // WIP utilization penalty
  if (metrics.wipUtilization > 0.9) score -= 20;
  else if (metrics.wipUtilization > 0.8) score -= 10;
  
  // Throughput penalty
  if (metrics.throughput < 2) score -= 25;
  else if (metrics.throughput < 4) score -= 15;
  
  // Cycle time penalty
  if (metrics.cycleTime > 21) score -= 20;
  else if (metrics.cycleTime > 14) score -= 10;
  
  // Blocker penalty
  score -= Math.min(metrics.blockerCount * 5, 20);
  
  // Innovation bonus/penalty
  if (metrics.ideasSubmitted < 5) score -= 10;
  
  return Math.max(score, 0);
}

function calculateCompletionRate(projects: any[]): number {
  if (projects.length === 0) return 0;
  const completed = projects.filter(p => p.stage === 'sunset').length;
  return Math.round((completed / projects.length) * 100);
}