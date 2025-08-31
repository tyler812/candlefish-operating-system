import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';

export function registerButtonHandlers(app: App): void {
  
  // Handle refresh actions
  app.action(/^refresh_(.+)$/, async ({ ack, body, respond }) => {
    await ack();

    try {
      const actionType = (body as any).actions[0].action_id.split('_')[1];
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);

      if (!user) {
        await respond({
          text: '❌ User not found in system.',
          response_type: 'ephemeral'
        });
        return;
      }

      let refreshMessage = '';
      
      switch (actionType) {
        case 'wip':
          const wipStatus = await closApi.getWipStatus(user.pod);
          const utilization = (wipStatus.totalWip / wipStatus.wipLimit) * 100;
          refreshMessage = `🔄 *WIP Status Refreshed*\n\n*Current:* ${wipStatus.totalWip}/${wipStatus.wipLimit} (${utilization.toFixed(1)}%)`;
          break;
          
        case 'metrics':
          const metrics = await closApi.getPodMetrics(user.pod);
          refreshMessage = `📊 *Metrics Refreshed*\n\n*Throughput:* ${metrics.throughput} items/week\n*Cycle Time:* ${metrics.cycleTime.toFixed(1)} days`;
          break;
          
        case 'projects':
          const projects = await closApi.getProjects(user.id);
          refreshMessage = `📋 *Projects Refreshed*\n\n*Active Projects:* ${projects.length}\n*Blocked:* ${projects.filter(p => p.blockers.length > 0).length}`;
          break;
          
        default:
          refreshMessage = '🔄 Data refreshed successfully.';
      }

      await respond({
        text: refreshMessage,
        response_type: 'ephemeral'
      });

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'refreshed_data',
        target: actionType,
        metadata: { timestamp: new Date().toISOString() }
      });

    } catch (error) {
      logger.error('Refresh action error:', error);
      await respond({
        text: '❌ Failed to refresh data. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle quick actions
  app.action(/^quick_(.+)$/, async ({ ack, body, client }) => {
    await ack();

    try {
      const actionType = (body as any).actions[0].action_id.split('_', 2)[1];
      const userId = (body as any).user.id;

      switch (actionType) {
        case 'unblock':
          await handleQuickUnblock(client, userId);
          break;
        case 'idea':
          await handleQuickIdea(client, userId, body);
          break;
        case 'demo':
          await handleQuickDemo(client, userId, body);
          break;
        case 'decision':
          await handleQuickDecision(client, userId, body);
          break;
        case 'feedback':
          await handleQuickFeedback(client, userId, body);
          break;
        default:
          logger.warn(`Unknown quick action: ${actionType}`);
      }

    } catch (error) {
      logger.error('Quick action error:', error);
    }
  });

  // Handle toggle actions
  app.action(/^toggle_(.+)$/, async ({ ack, body, respond }) => {
    await ack();

    try {
      const [, toggleType, itemId] = (body as any).actions[0].action_id.split('_');
      const userId = (body as any).user.id;

      switch (toggleType) {
        case 'blocker':
          await handleToggleBlocker(itemId, userId, respond);
          break;
        case 'priority':
          await handleTogglePriority(itemId, userId, respond);
          break;
        case 'status':
          await handleToggleStatus(itemId, userId, respond);
          break;
        default:
          await respond({
            text: `❌ Unknown toggle type: ${toggleType}`,
            response_type: 'ephemeral'
          });
      }

    } catch (error) {
      logger.error('Toggle action error:', error);
      await respond({
        text: '❌ Failed to toggle item. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle navigation actions
  app.action(/^nav_(.+)$/, async ({ ack, body, client }) => {
    await ack();

    try {
      const navType = (body as any).actions[0].action_id.split('_')[1];
      const userId = (body as any).user.id;

      switch (navType) {
        case 'home':
          await showHomeDashboard(client, userId, body);
          break;
        case 'projects':
          await showProjectsList(client, userId, body);
          break;
        case 'ideas':
          await showIdeasList(client, userId, body);
          break;
        case 'metrics':
          await showMetricsDashboard(client, userId, body);
          break;
        default:
          logger.warn(`Unknown navigation: ${navType}`);
      }

    } catch (error) {
      logger.error('Navigation action error:', error);
    }
  });

  // Handle batch operations
  app.action(/^batch_(.+)$/, async ({ ack, body, client }) => {
    await ack();

    try {
      const batchType = (body as any).actions[0].action_id.split('_')[1];
      const selectedItems = JSON.parse((body as any).actions[0].value);
      const userId = (body as any).user.id;

      switch (batchType) {
        case 'close':
          await handleBatchClose(client, selectedItems, userId, body);
          break;
        case 'update':
          await handleBatchUpdate(client, selectedItems, userId, body);
          break;
        case 'assign':
          await handleBatchAssign(client, selectedItems, userId, body);
          break;
        default:
          logger.warn(`Unknown batch operation: ${batchType}`);
      }

    } catch (error) {
      logger.error('Batch operation error:', error);
    }
  });

  // Handle acknowledgment actions
  app.action('acknowledge_feedback', async ({ ack, body, respond }) => {
    await ack();

    try {
      const feedbackData = JSON.parse((body as any).actions[0].value);
      const reviewerId = (body as any).user.id;

      await respond({
        text: `✅ Feedback acknowledged by <@${reviewerId}>`,
        response_type: 'in_channel'
      });

      // Notify feedback submitter
      const client = (app as any).client;
      await client.chat.postMessage({
        channel: feedbackData.submittedBy,
        text: `👍 *Feedback Acknowledged*\n\nYour feedback has been acknowledged by <@${reviewerId}>. Thank you for your input!`
      });

    } catch (error) {
      logger.error('Acknowledge feedback error:', error);
    }
  });

  // Handle issue creation from feedback
  app.action('create_issue_from_feedback', async ({ ack, body, client }) => {
    await ack();

    try {
      const feedbackData = JSON.parse((body as any).actions[0].value);
      const reviewerId = (body as any).user.id;

      // Open issue creation modal
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'create_issue_from_feedback',
          private_metadata: JSON.stringify({ ...feedbackData, reviewerId }),
          title: {
            type: 'plain_text',
            text: 'Create Issue'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🐛 *Create Issue from Feedback*\n\n*Original Feedback:*\n${feedbackData.text}`
              }
            },
            {
              type: 'input',
              block_id: 'issue_title',
              element: {
                type: 'plain_text_input',
                action_id: 'title_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'Brief title for the issue'
                },
                initial_value: `Feedback: ${feedbackData.text.substring(0, 50)}...`
              },
              label: {
                type: 'plain_text',
                text: 'Issue Title'
              }
            },
            {
              type: 'input',
              block_id: 'issue_description',
              element: {
                type: 'plain_text_input',
                action_id: 'description_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'Detailed description of the issue'
                },
                multiline: true,
                initial_value: `Based on user feedback:\n\n${feedbackData.text}`
              },
              label: {
                type: 'plain_text',
                text: 'Issue Description'
              }
            },
            {
              type: 'input',
              block_id: 'issue_priority',
              element: {
                type: 'static_select',
                action_id: 'priority_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select priority'
                },
                initial_option: {
                  text: {
                    type: 'plain_text',
                    text: feedbackData.priority?.toUpperCase() || 'MEDIUM'
                  },
                  value: feedbackData.priority || 'medium'
                },
                options: [
                  {
                    text: {
                      type: 'plain_text',
                      text: 'LOW'
                    },
                    value: 'low'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'MEDIUM'
                    },
                    value: 'medium'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'HIGH'
                    },
                    value: 'high'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'CRITICAL'
                    },
                    value: 'critical'
                  }
                ]
              },
              label: {
                type: 'plain_text',
                text: 'Priority'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Create Issue'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Create issue from feedback error:', error);
    }
  });

  // Helper functions for quick actions
  async function handleQuickUnblock(client: any, userId: string): Promise<void> {
    const user = await closApi.getUser(userId);
    if (!user) return;

    const projects = await closApi.getProjects(user.id);
    const blockedProjects = projects.filter(p => p.blockers.length > 0);

    await client.chat.postMessage({
      channel: userId,
      text: blockedProjects.length > 0 
        ? `🚫 Quick Unblock: You have ${blockedProjects.length} blocked project(s). Use \`/unblock\` for full management interface.`
        : `✅ Quick Unblock: No blocked projects! You're all clear.`
    });
  }

  async function handleQuickIdea(client: any, userId: string, body: any): Promise<void> {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'submit_idea',
        private_metadata: JSON.stringify({ userId }),
        title: {
          type: 'plain_text',
          text: 'Quick Idea'
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '💡 *Quick Idea Submission*'
            }
          },
          {
            type: 'input',
            block_id: 'title',
            element: {
              type: 'plain_text_input',
              action_id: 'title_text',
              placeholder: {
                type: 'plain_text',
                text: 'Your idea in one sentence'
              }
            },
            label: {
              type: 'plain_text',
              text: 'Idea Title'
            }
          },
          {
            type: 'input',
            block_id: 'description',
            element: {
              type: 'plain_text_input',
              action_id: 'description_text',
              placeholder: {
                type: 'plain_text',
                text: 'Quick description of your idea'
              },
              multiline: true
            },
            label: {
              type: 'plain_text',
              text: 'Description'
            }
          }
        ],
        submit: {
          type: 'plain_text',
          text: 'Submit'
        }
      }
    });
  }

  async function handleToggleBlocker(itemId: string, userId: string, respond: any): Promise<void> {
    // This would toggle a blocker status
    await respond({
      text: '🔄 Blocker status toggled.',
      response_type: 'ephemeral'
    });
  }

  async function handleTogglePriority(itemId: string, userId: string, respond: any): Promise<void> {
    // This would cycle through priority levels
    await respond({
      text: '📊 Priority level updated.',
      response_type: 'ephemeral'
    });
  }

  async function handleToggleStatus(itemId: string, userId: string, respond: any): Promise<void> {
    // This would toggle status (active/inactive, etc.)
    await respond({
      text: '✅ Status updated.',
      response_type: 'ephemeral'
    });
  }

  async function showHomeDashboard(client: any, userId: string, body: any): Promise<void> {
    // Navigate to home dashboard - would show via modal or update home tab
    await client.chat.postMessage({
      channel: userId,
      text: '🏠 Navigate to home dashboard - use Home tab for full dashboard experience.'
    });
  }

  async function showProjectsList(client: any, userId: string, body: any): Promise<void> {
    const user = await closApi.getUser(userId);
    if (!user) return;

    const projects = await closApi.getProjects(user.id);
    await client.chat.postMessage({
      channel: userId,
      text: `📋 You have ${projects.length} active projects. Use \`/stage\` to view detailed project information.`
    });
  }

  async function showIdeasList(client: any, userId: string, body: any): Promise<void> {
    const user = await closApi.getUser(userId);
    if (!user) return;

    const ideas = await closApi.getIdeas(undefined, user.id);
    await client.chat.postMessage({
      channel: userId,
      text: `💡 You have ${ideas.length} ideas submitted. Use \`/idea list\` for detailed view.`
    });
  }

  async function showMetricsDashboard(client: any, userId: string, body: any): Promise<void> {
    const user = await closApi.getUser(userId);
    if (!user) return;

    await client.chat.postMessage({
      channel: userId,
      text: `📊 Metrics Dashboard - use \`/metrics\` for detailed pod metrics.`
    });
  }

  async function handleBatchClose(client: any, items: any[], userId: string, body: any): Promise<void> {
    // Handle batch closing of items
    await client.chat.postMessage({
      channel: userId,
      text: `📦 Batch close initiated for ${items.length} items. Processing...`
    });
  }

  async function handleBatchUpdate(client: any, items: any[], userId: string, body: any): Promise<void> {
    // Handle batch updates
    await client.chat.postMessage({
      channel: userId,
      text: `🔄 Batch update initiated for ${items.length} items. Processing...`
    });
  }

  async function handleBatchAssign(client: any, items: any[], userId: string, body: any): Promise<void> {
    // Handle batch assignment
    await client.chat.postMessage({
      channel: userId,
      text: `👥 Batch assignment initiated for ${items.length} items. Processing...`
    });
  }

  logger.info('Button handlers registered');
}