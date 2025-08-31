import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export function registerStageGateEvents(app: App): void {
  // Listen for stage gate advancement requests
  app.view('stage_advancement_request', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const justification = values.justification.justification_text.value;
      const projectId = metadata.projectId;
      const targetStage = metadata.nextStage;
      
      // Submit advancement request
      await closApi.requestStageGateAdvancement(projectId, targetStage, justification);
      
      const project = await closApi.getProject(projectId);
      const userId = body.user.id;

      // Send confirmation to user
      await client.chat.postMessage({
        channel: userId,
        text: `🎯 *Stage Gate Advancement Requested*\n\n*Project:* ${project.name}\n*From:* ${metadata.currentStage.toUpperCase()}\n*To:* ${targetStage.toUpperCase()}\n*Status:* Pending Review\n\nYour request has been submitted to the stage gate committee. You'll be notified when it's reviewed.`
      });

      // Notify stage gate committee/reviewers
      const reviewChannel = '#stage-gates'; // Configure this channel
      try {
        await client.chat.postMessage({
          channel: reviewChannel,
          text: `🎯 *New Stage Gate Advancement Request*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎯 *Stage Gate Advancement Request*\n\n*Project:* ${project.name}\n*Owner:* <@${userId}>\n*Current Stage:* ${metadata.currentStage.toUpperCase()}\n*Requested Stage:* ${targetStage.toUpperCase()}`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Justification:*\n${justification}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Approve Advancement'
                  },
                  action_id: 'approve_stage_advancement',
                  value: JSON.stringify({ projectId, targetStage, requesterId: userId }),
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Review Requirements'
                  },
                  action_id: 'review_stage_requirements',
                  value: JSON.stringify({ projectId, targetStage })
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Request Changes'
                  },
                  action_id: 'reject_stage_advancement',
                  value: JSON.stringify({ projectId, targetStage, requesterId: userId }),
                  style: 'danger'
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to notify stage gate channel:', channelError);
      }

      // Log activity
      await closApi.logActivity({
        userId: (await closApi.getUser(userId))?.id || userId,
        action: 'requested_stage_advancement',
        target: projectId,
        metadata: { 
          currentStage: metadata.currentStage, 
          targetStage,
          justification: justification.substring(0, 100) + '...'
        }
      });

    } catch (error) {
      logger.error('Stage advancement request error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to submit stage advancement request. Please try again or contact support.'
      });
    }
  });

  // Handle stage advancement approval
  app.action('approve_stage_advancement', async ({ ack, body, respond, client }) => {
    await ack();

    try {
      const actionData = JSON.parse((body as any).actions[0].value);
      const { projectId, targetStage, requesterId } = actionData;
      const reviewerId = (body as any).user.id;

      // Update project stage
      const updatedProject = await closApi.updateProjectStage(projectId, targetStage);

      // Notify requester
      await client.chat.postMessage({
        channel: requesterId,
        text: `🎉 *Stage Gate Advancement Approved!*\n\n*Project:* ${updatedProject.name}\n*New Stage:* ${targetStage.toUpperCase()}\n*Approved by:* <@${reviewerId}>\n*Date:* ${formatDate(new Date())}\n\nCongratulations! Your project has successfully advanced to the next stage.`
      });

      // Update the original message
      await respond({
        text: `✅ Stage advancement approved by <@${reviewerId}> on ${formatDate(new Date())}`,
        response_type: 'in_channel'
      });

      // Post to project updates channel
      const updatesChannel = '#project-updates';
      try {
        await client.chat.postMessage({
          channel: updatesChannel,
          text: `🎯 *Project Stage Advancement*\n\n*Project:* ${updatedProject.name}\n*Advanced to:* ${targetStage.toUpperCase()}\n*Owner:* <@${requesterId}>\n*Approved by:* <@${reviewerId}>`
        });
      } catch (channelError) {
        logger.warn('Failed to post to updates channel:', channelError);
      }

      // Log activity
      await closApi.logActivity({
        userId: (await closApi.getUser(reviewerId))?.id || reviewerId,
        action: 'approved_stage_advancement',
        target: projectId,
        metadata: { targetStage, requesterId }
      });

    } catch (error) {
      logger.error('Approve stage advancement error:', error);
      await respond({
        text: '❌ Failed to approve stage advancement. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle stage advancement rejection
  app.action('reject_stage_advancement', async ({ ack, body, client }) => {
    await ack();

    try {
      const actionData = JSON.parse((body as any).actions[0].value);
      const { projectId, targetStage, requesterId } = actionData;

      // Open rejection modal with reason
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'stage_rejection_reason',
          private_metadata: JSON.stringify({ projectId, targetStage, requesterId, reviewerId: (body as any).user.id }),
          title: {
            type: 'plain_text',
            text: 'Request Changes'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '🔄 *Request Changes for Stage Advancement*\n\nPlease provide feedback on what needs to be addressed before this project can advance.'
              }
            },
            {
              type: 'input',
              block_id: 'feedback',
              element: {
                type: 'plain_text_input',
                action_id: 'feedback_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Explain what requirements are missing or need improvement...'
                },
                multiline: true,
                max_length: 1000
              },
              label: {
                type: 'plain_text',
                text: 'Feedback & Required Changes'
              }
            },
            {
              type: 'input',
              block_id: 'requirements',
              element: {
                type: 'checkboxes',
                action_id: 'missing_requirements',
                options: [
                  {
                    text: {
                      type: 'plain_text',
                      text: 'User testing incomplete'
                    },
                    value: 'user_testing'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Technical documentation missing'
                    },
                    value: 'tech_docs'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Market validation insufficient'
                    },
                    value: 'market_validation'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Business case not compelling'
                    },
                    value: 'business_case'
                  },
                  {
                    text: {
                      type: 'plain_text',
                      text: 'Resource requirements unclear'
                    },
                    value: 'resources'
                  }
                ]
              },
              label: {
                type: 'plain_text',
                text: 'Missing Requirements (optional)'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Send Feedback'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Reject stage advancement error:', error);
    }
  });

  // Handle stage rejection feedback
  app.view('stage_rejection_reason', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const feedback = values.feedback.feedback_text.value;
      const missingRequirements = values.requirements.missing_requirements.selected_options || [];
      
      const project = await closApi.getProject(metadata.projectId);

      // Notify requester with feedback
      const requirementsList = missingRequirements.map(req => `• ${req.text.text}`).join('\n');
      
      await client.chat.postMessage({
        channel: metadata.requesterId,
        text: `🔄 *Stage Advancement - Changes Requested*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔄 *Changes Requested for ${project.name}*\n\n*Requested Stage:* ${metadata.targetStage.toUpperCase()}\n*Reviewer:* <@${metadata.reviewerId}>\n*Date:* ${formatDate(new Date())}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Feedback:*\n${feedback}`
            }
          },
          ...(requirementsList ? [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Missing Requirements:*\n${requirementsList}`
            }
          }] : []),
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Next Steps:*\n• Address the feedback provided\n• Complete any missing requirements\n• Resubmit advancement request when ready\n• Contact reviewer if you have questions'
            }
          }
        ]
      });

      // Update original message
      const originalMessage = (body as any).response_urls?.[0];
      if (originalMessage) {
        try {
          await client.chat.update({
            channel: originalMessage.channel,
            ts: originalMessage.ts,
            text: `🔄 Changes requested by <@${metadata.reviewerId}> on ${formatDate(new Date())}`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🔄 *Changes Requested*\n\nReviewer: <@${metadata.reviewerId}>\nFeedback provided to project owner.`
                }
              }
            ]
          });
        } catch (updateError) {
          logger.warn('Failed to update original message:', updateError);
        }
      }

      // Log activity
      await closApi.logActivity({
        userId: (await closApi.getUser(metadata.reviewerId))?.id || metadata.reviewerId,
        action: 'requested_stage_changes',
        target: metadata.projectId,
        metadata: { 
          targetStage: metadata.targetStage, 
          requesterId: metadata.requesterId,
          feedback: feedback.substring(0, 100) + '...'
        }
      });

    } catch (error) {
      logger.error('Stage rejection feedback error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to send feedback. Please try again or contact support.'
      });
    }
  });

  // Handle stage requirement review
  app.action('review_stage_requirements', async ({ ack, body, client }) => {
    await ack();

    try {
      const actionData = JSON.parse((body as any).actions[0].value);
      const { projectId, targetStage } = actionData;

      // Get stage gate requirements
      const gateCheck = await closApi.checkStageGateRequirements(projectId, targetStage);
      const project = await closApi.getProject(projectId);

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎯 *Stage Gate Requirements Review*\n\n*Project:* ${project.name}\n*Target Stage:* ${targetStage.toUpperCase()}`
          }
        },
        {
          type: 'divider'
        }
      ];

      // Add requirements checklist
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

      // Add overall status
      const statusEmoji = gateCheck.canAdvance ? '🟢' : '🔴';
      const statusText = gateCheck.canAdvance ? 'Ready for advancement' : 'Requirements not met';
      
      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${statusEmoji} *Status:* ${statusText}`
          }
        }
      );

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Requirements Review'
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('Review stage requirements error:', error);
    }
  });

  logger.info('Stage gate event handlers registered');
}