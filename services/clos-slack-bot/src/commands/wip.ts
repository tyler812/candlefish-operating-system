import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatProjectStatus, createProgressBar } from '../utils/helpers';

export function registerWipCommand(app: App): void {
  app.command('/wip', async ({ command, ack, respond }) => {
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

      // Parse command text for pod filter
      const text = command.text.trim();
      const pod = text || user.pod;

      // Get WIP status
      const wipStatus = await closApi.getWipStatus(pod);
      const utilizationPercentage = (wipStatus.totalWip / wipStatus.wipLimit) * 100;
      
      // Determine status color and emoji
      let statusEmoji = '🟢';
      let statusText = 'HEALTHY';
      
      if (utilizationPercentage >= 100) {
        statusEmoji = '🔴';
        statusText = 'AT LIMIT';
      } else if (utilizationPercentage >= 80) {
        statusEmoji = '🟡';
        statusText = 'HIGH';
      }

      // Create progress bar
      const progressBar = createProgressBar(wipStatus.totalWip, wipStatus.wipLimit, 20);

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *WIP Status for ${pod}*\n\n*Status:* ${statusText}\n*Utilization:* ${utilizationPercentage.toFixed(1)}%\n*Current WIP:* ${wipStatus.totalWip} / ${wipStatus.wipLimit}\n\n${progressBar}`
          }
        }
      ];

      if (wipStatus.projects.length > 0) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Active Projects:*'
            }
          }
        );

        // Add project details
        for (const project of wipStatus.projects) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: formatProjectStatus(project)
            }
          });
        }
      }

      // Add recommendations based on WIP status
      if (utilizationPercentage >= 100) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 *Action Required:* Your pod is at WIP limit!\n\n*Recommendations:*\n• Complete and close current projects before starting new ones\n• Review project priorities with your pod\n• Consider breaking large projects into smaller deliverables\n• Use \`/unblock\` to resolve any blockers`
            }
          }
        );
      } else if (utilizationPercentage >= 80) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⚠️ *Approaching Limit:* Consider wrapping up projects before starting new ones.\n\n*Tips:*\n• Focus on completing current work\n• Avoid taking on new commitments\n• Review project scope and priorities`
            }
          }
        );
      } else if (utilizationPercentage < 50) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `💡 *Capacity Available:* Your pod has room for more work.\n\n*Consider:*\n• Reviewing the idea backlog with \`/idea list\`\n• Taking on additional projects from the pipeline\n• Helping other pods with their blockers`
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
                text: 'View All Pods'
              },
              action_id: 'wip_all_pods',
              value: 'all'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Refresh Status'
              },
              action_id: 'wip_refresh',
              value: pod
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Project Details'
              },
              action_id: 'wip_project_details',
              value: pod
            }
          ]
        }
      );

      await respond({
        text: `WIP Status: ${wipStatus.totalWip}/${wipStatus.wipLimit} (${utilizationPercentage.toFixed(1)}%)`,
        blocks,
        response_type: command.text.includes('public') ? 'in_channel' : 'ephemeral'
      });

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'checked_wip_status',
        target: pod,
        metadata: { wipUtilization: utilizationPercentage }
      });

    } catch (error) {
      logger.error('WIP command error:', error);
      await respond({
        text: '❌ Failed to get WIP status. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle WIP action buttons
  app.action('wip_all_pods', async ({ ack, respond, body }) => {
    await ack();

    try {
      // Get WIP status for all pods
      const allPodsStatus = await closApi.getWipStatus();
      
      // This would require API modification to return all pods
      // For now, show a placeholder message
      await respond({
        text: '📊 *All Pods WIP Status*\n\n_Feature coming soon - will show WIP status across all pods_',
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('WIP all pods error:', error);
      await respond({
        text: '❌ Failed to get all pods status.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('wip_refresh', async ({ ack, respond, body }) => {
    await ack();

    try {
      const pod = (body as any).actions[0].value;
      const wipStatus = await closApi.getWipStatus(pod);
      const utilizationPercentage = (wipStatus.totalWip / wipStatus.wipLimit) * 100;
      
      await respond({
        text: `🔄 Refreshed WIP Status for ${pod}: ${wipStatus.totalWip}/${wipStatus.wipLimit} (${utilizationPercentage.toFixed(1)}%)`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('WIP refresh error:', error);
      await respond({
        text: '❌ Failed to refresh WIP status.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('wip_project_details', async ({ ack, body, client }) => {
    await ack();

    try {
      const pod = (body as any).actions[0].value;
      const wipStatus = await closApi.getWipStatus(pod);

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Detailed Project Status for ${pod}*`
          }
        },
        {
          type: 'divider'
        }
      ];

      for (const project of wipStatus.projects) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: formatProjectStatus(project)
          }
        });
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Project Details'
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('WIP project details error:', error);
    }
  });
}