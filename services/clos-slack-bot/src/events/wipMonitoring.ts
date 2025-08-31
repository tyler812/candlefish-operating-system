import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate, createProgressBar } from '../utils/helpers';

export function registerWipEvents(app: App): void {
  // Monitor for WIP limit violations
  async function checkWipLimits(): Promise<void> {
    try {
      // This would be called periodically to check all pods
      // For now, we'll handle it through webhook events from CLOS API
      logger.info('WIP monitoring check completed');
    } catch (error) {
      logger.error('WIP monitoring error:', error);
    }
  }

  // Handle WIP limit violation notifications
  async function handleWipViolation(client: any, podData: any): Promise<void> {
    try {
      const { podName, wipLimit, currentWip, projects } = podData;
      const violation = currentWip > wipLimit;
      
      if (!violation) return;

      const utilizationPercentage = (currentWip / wipLimit) * 100;
      const progressBar = createProgressBar(currentWip, wipLimit, 15);

      // Send alert to pod members
      const podChannel = `#${podName.toLowerCase()}-pod`; // Assuming pod channels exist
      
      try {
        await client.chat.postMessage({
          channel: podChannel,
          text: `🚨 *WIP Limit Exceeded!*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚨 *WIP Limit Violation Alert*\n\n*Pod:* ${podName}\n*Current WIP:* ${currentWip}\n*WIP Limit:* ${wipLimit}\n*Utilization:* ${utilizationPercentage.toFixed(1)}%\n\n${progressBar}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*🔥 Immediate Action Required:*\n• Stop taking on new work\n• Focus on completing current projects\n• Review project priorities\n• Consider breaking down large projects\n• Use \`/unblock\` to resolve any blockers`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Current Projects'
                  },
                  action_id: 'view_wip_projects',
                  value: podName,
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Start Unblock Session'
                  },
                  action_id: 'start_pod_unblock',
                  value: podName
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Review Priorities'
                  },
                  action_id: 'review_pod_priorities',
                  value: podName
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn(`Failed to send WIP alert to ${podChannel}:`, channelError);
        
        // Fallback: Send DMs to project owners
        for (const project of projects) {
          try {
            const user = await closApi.getUser(project.owner);
            if (user) {
              await client.chat.postMessage({
                channel: user.slackUserId,
                text: `🚨 *WIP Limit Alert*\n\nYour pod "${podName}" has exceeded its WIP limit (${currentWip}/${wipLimit}). Please focus on completing current projects before starting new work.\n\nUse \`/wip\` to check current status.`
              });
            }
          } catch (dmError) {
            logger.warn(`Failed to send WIP DM to ${project.owner}:`, dmError);
          }
        }
      }

      // Log the violation
      await closApi.logActivity({
        userId: 'system',
        action: 'wip_limit_violated',
        target: podName,
        metadata: { currentWip, wipLimit, utilizationPercentage }
      });

    } catch (error) {
      logger.error('Handle WIP violation error:', error);
    }
  }

  // Handle approaching WIP limit warnings
  async function handleWipWarning(client: any, podData: any): Promise<void> {
    try {
      const { podName, wipLimit, currentWip, projects } = podData;
      const utilizationPercentage = (currentWip / wipLimit) * 100;
      
      // Only warn if utilization is between 80-95%
      if (utilizationPercentage < 80 || utilizationPercentage >= 100) return;

      const progressBar = createProgressBar(currentWip, wipLimit, 15);
      const podChannel = `#${podName.toLowerCase()}-pod`;
      
      try {
        await client.chat.postMessage({
          channel: podChannel,
          text: `⚠️ *Approaching WIP Limit*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⚠️ *WIP Limit Warning*\n\n*Pod:* ${podName}\n*Current WIP:* ${currentWip}\n*WIP Limit:* ${wipLimit}\n*Utilization:* ${utilizationPercentage.toFixed(1)}%\n\n${progressBar}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*💡 Recommendations:*\n• Consider completing current work before starting new projects\n• Review project scope and priorities\n• Look for opportunities to break down large projects\n• Monitor daily to prevent exceeding limit`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Check Status'
                  },
                  action_id: 'check_wip_status',
                  value: podName
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Resolve Blockers'
                  },
                  action_id: 'resolve_pod_blockers',
                  value: podName
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn(`Failed to send WIP warning to ${podChannel}:`, channelError);
      }

    } catch (error) {
      logger.error('Handle WIP warning error:', error);
    }
  }

  // Handle WIP action buttons
  app.action('view_wip_projects', async ({ ack, body, client }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      const wipStatus = await closApi.getWipStatus(podName);
      
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📊 *Current Projects for ${podName}*\n\n*WIP:* ${wipStatus.totalWip}/${wipStatus.wipLimit}`
          }
        },
        {
          type: 'divider'
        }
      ];

      for (const project of wipStatus.projects) {
        const blockerStatus = project.blockers.length > 0 ? `🚫 ${project.blockers.length} blocker(s)` : '✅ No blockers';
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${project.name}*\n*Stage:* ${project.stage.toUpperCase()}\n*Owner:* ${project.owner}\n*Status:* ${blockerStatus}\n*Last Updated:* ${formatDate(project.lastUpdated)}`
          }
        });
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: `${podName} Projects`
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('View WIP projects error:', error);
    }
  });

  app.action('start_pod_unblock', async ({ ack, body, respond }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      const userId = (body as any).user.id;
      
      await respond({
        text: `🚫 *Starting Pod Unblock Session*\n\nUse \`/unblock\` command to start your personal unblock session, or coordinate with your pod to resolve shared blockers.\n\n*Pod:* ${podName}`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Start pod unblock error:', error);
    }
  });

  app.action('review_pod_priorities', async ({ ack, body, client }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      
      // Open priority review modal
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'pod_priority_review',
          private_metadata: JSON.stringify({ podName }),
          title: {
            type: 'plain_text',
            text: 'Review Priorities'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎯 *Priority Review for ${podName}*\n\nUse this session to discuss project priorities and identify what can be deprioritized or delayed.`
              }
            },
            {
              type: 'input',
              block_id: 'actions',
              element: {
                type: 'checkboxes',
                action_id: 'priority_actions',
                options: [
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Postpone low-priority projects'
                    },
                    value: 'postpone_low'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Break down large projects'
                    },
                    value: 'break_down'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Reassign projects to other pods'
                    },
                    value: 'reassign'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Schedule priority meeting'
                    },
                    value: 'schedule_meeting'
                  }
                ]
              },
              label: {
                type: 'plain_text',
                text: 'Recommended Actions'
              }
            },
            {
              type: 'input',
              block_id: 'notes',
              element: {
                type: 'plain_text_input',
                action_id: 'notes_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Notes from priority discussion...'
                },
                multiline: true
              },
              label: {
                type: 'plain_text',
                text: 'Priority Review Notes'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Save Review'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Review pod priorities error:', error);
    }
  });

  // Handle priority review submission
  app.view('pod_priority_review', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const actions = values.actions.priority_actions.selected_options || [];
      const notes = values.notes.notes_text.value;
      const podName = metadata.podName;
      const reviewerId = body.user.id;

      // Post review summary to pod channel
      const podChannel = `#${podName.toLowerCase()}-pod`;
      const actionsList = actions.map(action => `• ${action.text.text}`).join('\n');
      
      try {
        await client.chat.postMessage({
          channel: podChannel,
          text: `🎯 *Priority Review Completed*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎯 *Priority Review Summary*\n\n*Reviewer:* <@${reviewerId}>\n*Date:* ${formatDate(new Date())}\n*Pod:* ${podName}`
              }
            },
            ...(actionsList ? [{
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Recommended Actions:*\n${actionsList}`
              }
            }] : []),
            ...(notes ? [{
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Notes:*\n${notes}`
              }
            }] : []),
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Next Steps:*\n• Implement recommended actions\n• Monitor WIP levels daily\n• Follow up on progress in next standup'
              }
            }
          ]
        });
      } catch (channelError) {
        logger.warn(`Failed to post priority review to ${podChannel}:`, channelError);
      }

      // Log activity
      await closApi.logActivity({
        userId: (await closApi.getUser(reviewerId))?.id || reviewerId,
        action: 'completed_priority_review',
        target: podName,
        metadata: { actions: actions.map(a => a.value), notes }
      });

    } catch (error) {
      logger.error('Priority review submission error:', error);
    }
  });

  // Handle other WIP monitoring actions
  app.action('check_wip_status', async ({ ack, body, respond }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      const wipStatus = await closApi.getWipStatus(podName);
      const utilizationPercentage = (wipStatus.totalWip / wipStatus.wipLimit) * 100;
      
      await respond({
        text: `📊 Current WIP Status for ${podName}: ${wipStatus.totalWip}/${wipStatus.wipLimit} (${utilizationPercentage.toFixed(1)}%)\n\nUse \`/wip\` for detailed interactive view.`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Check WIP status error:', error);
      await respond({
        text: '❌ Failed to check WIP status.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('resolve_pod_blockers', async ({ ack, body, respond }) => {
    await ack();

    try {
      const podName = (body as any).actions[0].value;
      
      await respond({
        text: `🚫 *Pod Blocker Resolution*\n\nUse \`/unblock\` to start resolving blockers for your projects in ${podName} pod.\n\nCoordinate with your pod members to address shared blockers and dependencies.`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Resolve pod blockers error:', error);
    }
  });

  // Export functions for external use (e.g., from webhooks)
  (app as any).wipMonitoring = {
    handleWipViolation,
    handleWipWarning,
    checkWipLimits
  };

  logger.info('WIP monitoring event handlers registered');
}