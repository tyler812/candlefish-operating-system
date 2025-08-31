import { App, SlashCommand, Middleware, SlackCommandMiddlewareArgs } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatProjectStatus } from '../utils/helpers';

export function registerUnblockCommand(app: App): void {
  app.command('/unblock', async ({ command, ack, respond, client }) => {
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

      // Get current projects with blockers
      const projects = await closApi.getProjects(user.id);
      const blockedProjects = projects.filter(p => p.blockers.length > 0);

      if (blockedProjects.length === 0) {
        await respond({
          text: '🎉 Great! You have no blocked projects right now. Keep up the good work!',
          response_type: 'ephemeral'
        });
        return;
      }

      // Start unblock session
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🚫 *Daily Unblock Session*\n\nYou have ${blockedProjects.length} blocked project(s). Let's work through them:`
          }
        },
        {
          type: 'divider'
        }
      ];

      // Add each blocked project
      for (const project of blockedProjects) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: formatProjectStatus(project)
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Resolve Blockers'
            },
            action_id: 'resolve_blockers',
            value: project.id
          }
        });
      }

      // Add help section
      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*How to resolve blockers:*
• Click "Resolve Blockers" for each project
• Update blocker status or remove resolved ones
• Add new blockers if discovered
• Request help from your pod or other teams

*Need help?* Type \`/help unblock\` for more options.`
          }
        }
      );

      await respond({
        text: `You have ${blockedProjects.length} blocked project(s)`,
        blocks,
        response_type: 'ephemeral'
      });

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'started_unblock_session',
        target: 'projects',
        metadata: { blockedProjectCount: blockedProjects.length }
      });

    } catch (error) {
      logger.error('Unblock command error:', error);
      await respond({
        text: '❌ Failed to start unblock session. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle blocker resolution
  app.action('resolve_blockers', async ({ ack, body, respond, client }) => {
    await ack();

    try {
      const projectId = (body as any).actions[0].value;
      const userId = (body as any).user.id;

      const project = await closApi.getProject(projectId);
      
      // Open modal for blocker management
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'manage_blockers',
          private_metadata: JSON.stringify({ projectId, userId }),
          title: {
            type: 'plain_text',
            text: 'Manage Blockers'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Project:* ${project.name}\n*Current Blockers:*`
              }
            },
            ...project.blockers.map((blocker, index) => ({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${index + 1}. ${blocker}`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Remove'
                },
                action_id: 'remove_blocker',
                value: `${projectId}:${index}`,
                style: 'danger'
              }
            })),
            {
              type: 'divider'
            },
            {
              type: 'input',
              block_id: 'new_blocker',
              element: {
                type: 'plain_text_input',
                action_id: 'new_blocker_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Describe the new blocker...'
                },
                multiline: true
              },
              label: {
                type: 'plain_text',
                text: 'Add New Blocker (optional)'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Update Blockers'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Resolve blockers error:', error);
      await respond({
        text: '❌ Failed to open blocker management. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle blocker removal
  app.action('remove_blocker', async ({ ack, body, respond }) => {
    await ack();

    try {
      const [projectId, blockerIndex] = (body as any).actions[0].value.split(':');
      const project = await closApi.getProject(projectId);
      
      // Remove blocker (assuming API supports removal by index or content)
      const blockerToRemove = project.blockers[parseInt(blockerIndex)];
      await closApi.removeBlocker(projectId, blockerToRemove);

      await respond({
        text: `✅ Removed blocker: "${blockerToRemove}"`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Remove blocker error:', error);
      await respond({
        text: '❌ Failed to remove blocker. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });
}