import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatProjectStatus } from '../utils/helpers';

export function registerStageCommand(app: App): void {
  app.command('/stage', async ({ command, ack, respond, client }) => {
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
      
      // If no project specified, show all user's projects
      if (!text) {
        const projects = await closApi.getProjects(user.id);
        
        if (projects.length === 0) {
          await respond({
            text: '📋 You have no active projects. Use `/idea` to submit new project ideas!',
            response_type: 'ephemeral'
          });
          return;
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *Your Projects & Stage Gates*\n\nSelect a project to check stage gate requirements:`
            }
          },
          {
            type: 'divider'
          }
        ];

        for (const project of projects) {
          const stageEmojis = {
            idea: '💡',
            prototype: '🔧',
            mvp: '🚀',
            scale: '📈',
            sunset: '🌅'
          };

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${stageEmojis[project.stage]} *${project.name}*\n*Current Stage:* ${project.stage.toUpperCase()}\n*Pod:* ${project.pod}`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Check Gate'
              },
              action_id: 'check_stage_gate',
              value: project.id
            }
          });
        }

        await respond({
          text: `You have ${projects.length} active project(s)`,
          blocks,
          response_type: 'ephemeral'
        });

        return;
      }

      // Parse command for specific project actions
      const parts = text.split(' ');
      const action = parts[0].toLowerCase();

      if (action === 'advance') {
        // Handle stage advancement request
        const projectName = parts.slice(1).join(' ');
        if (!projectName) {
          await respond({
            text: '❌ Please specify a project name: `/stage advance Project Name`',
            response_type: 'ephemeral'
          });
          return;
        }

        // Find project by name
        const projects = await closApi.getProjects(user.id);
        const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));

        if (!project) {
          await respond({
            text: `❌ Project "${projectName}" not found. Use \`/stage\` to see your projects.`,
            response_type: 'ephemeral'
          });
          return;
        }

        // Open advancement modal
        const nextStages = {
          idea: 'prototype',
          prototype: 'mvp',
          mvp: 'scale',
          scale: 'sunset'
        };

        const nextStage = nextStages[project.stage as keyof typeof nextStages];
        if (!nextStage) {
          await respond({
            text: `❌ Project "${project.name}" is already at the final stage (${project.stage.toUpperCase()}).`,
            response_type: 'ephemeral'
          });
          return;
        }

        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'stage_advancement_request',
            private_metadata: JSON.stringify({ projectId: project.id, currentStage: project.stage, nextStage }),
            title: {
              type: 'plain_text',
              text: 'Stage Gate Advancement'
            },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Project:* ${project.name}\n*Current Stage:* ${project.stage.toUpperCase()}\n*Requesting Advancement To:* ${nextStage.toUpperCase()}`
                }
              },
              {
                type: 'input',
                block_id: 'justification',
                element: {
                  type: 'plain_text_input',
                  action_id: 'justification_text',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Explain why this project is ready to advance...'
                  },
                  multiline: true
                },
                label: {
                  type: 'plain_text',
                  text: 'Justification for Advancement'
                }
              }
            ],
            submit: {
              type: 'plain_text',
              text: 'Request Advancement'
            },
            close: {
              type: 'plain_text',
              text: 'Cancel'
            }
          }
        });
      } else {
        await respond({
          text: '❌ Unknown stage command. Use `/stage` to see your projects or `/stage advance <project>` to request advancement.',
          response_type: 'ephemeral'
        });
      }

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'checked_stage_gates',
        target: 'projects',
        metadata: { command: text }
      });

    } catch (error) {
      logger.error('Stage command error:', error);
      await respond({
        text: '❌ Failed to check stage gates. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle stage gate checking
  app.action('check_stage_gate', async ({ ack, body, client }) => {
    await ack();

    try {
      const projectId = (body as any).actions[0].value;
      const project = await closApi.getProject(projectId);

      // Get next stage
      const nextStages = {
        idea: 'prototype',
        prototype: 'mvp',
        mvp: 'scale',
        scale: 'sunset'
      };

      const nextStage = nextStages[project.stage as keyof typeof nextStages];
      
      if (!nextStage) {
        await client.views.open({
          trigger_id: (body as any).trigger_id,
          view: {
            type: 'modal',
            title: {
              type: 'plain_text',
              text: 'Stage Gate Status'
            },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🏁 *${project.name}*\n\nThis project is at the final stage: *${project.stage.toUpperCase()}*\n\nNo further advancement available.`
                }
              }
            ],
            close: {
              type: 'plain_text',
              text: 'Close'
            }
          }
        });
        return;
      }

      // Check stage gate requirements
      const gateCheck = await closApi.checkStageGateRequirements(projectId, nextStage as any);

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎯 *Stage Gate: ${project.stage.toUpperCase()} → ${nextStage.toUpperCase()}*\n\n*Project:* ${project.name}`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Requirements:*'
          }
        }
      ];

      // Add requirements
      for (const req of gateCheck.requirements) {
        const emoji = req.met ? '✅' : '❌';
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${req.name}*\n${req.description}`
          }
        });
      }

      // Add status and actions
      if (gateCheck.canAdvance) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🟢 *All requirements met!* Ready to advance to next stage.'
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Request Advancement'
              },
              action_id: 'request_stage_advancement',
              value: projectId,
              style: 'primary'
            }
          }
        );
      } else {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔴 *Requirements not met.* Complete missing requirements before advancing.'
            }
          }
        );
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Stage Gate Requirements'
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('Stage gate check error:', error);
    }
  });

  // Handle advancement request button
  app.action('request_stage_advancement', async ({ ack, body, client }) => {
    await ack();

    try {
      const projectId = (body as any).actions[0].value;
      const project = await closApi.getProject(projectId);

      const nextStages = {
        idea: 'prototype',
        prototype: 'mvp',
        mvp: 'scale',
        scale: 'sunset'
      };

      const nextStage = nextStages[project.stage as keyof typeof nextStages];

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'stage_advancement_request',
          private_metadata: JSON.stringify({ projectId, currentStage: project.stage, nextStage }),
          title: {
            type: 'plain_text',
            text: 'Request Advancement'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Project:* ${project.name}\n*Current Stage:* ${project.stage.toUpperCase()}\n*Requesting Advancement To:* ${nextStage?.toUpperCase()}`
              }
            },
            {
              type: 'input',
              block_id: 'justification',
              element: {
                type: 'plain_text_input',
                action_id: 'justification_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Explain why this project is ready to advance...'
                },
                multiline: true
              },
              label: {
                type: 'plain_text',
                text: 'Justification for Advancement'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Submit Request'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Request advancement error:', error);
    }
  });
}