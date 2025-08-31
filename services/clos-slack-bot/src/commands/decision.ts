import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export function registerDecisionCommand(app: App): void {
  app.command('/decision', async ({ command, ack, respond, client }) => {
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
      const action = parts[0].toLowerCase();

      if (!text || action === 'create' || action === 'new') {
        // Open decision creation modal
        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'create_decision',
            private_metadata: JSON.stringify({ userId: user.id }),
            title: {
              type: 'plain_text',
              text: 'Create Decision Memo'
            },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '📋 *Document an important decision*\n\nDecision memos help track key choices and their rationale for future reference.'
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
                    text: 'Brief title describing the decision'
                  },
                  max_length: 100
                },
                label: {
                  type: 'plain_text',
                  text: 'Decision Title'
                }
              },
              {
                type: 'input',
                block_id: 'context',
                element: {
                  type: 'plain_text_input',
                  action_id: 'context_text',
                  placeholder: {
                    type: 'plain_text',
                    text: 'What situation or problem led to this decision?'
                  },
                  multiline: true,
                  max_length: 500
                },
                label: {
                  type: 'plain_text',
                  text: 'Context & Background'
                }
              },
              {
                type: 'input',
                block_id: 'options',
                element: {
                  type: 'plain_text_input',
                  action_id: 'options_text',
                  placeholder: {
                    type: 'plain_text',
                    text: '1. Option A - description\n2. Option B - description\n3. Option C - description'
                  },
                  multiline: true,
                  max_length: 750
                },
                label: {
                  type: 'plain_text',
                  text: 'Options Considered'
                }
              },
              {
                type: 'input',
                block_id: 'recommendation',
                element: {
                  type: 'plain_text_input',
                  action_id: 'recommendation_text',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Which option is recommended and why?'
                  },
                  multiline: true,
                  max_length: 500
                },
                label: {
                  type: 'plain_text',
                  text: 'Recommendation'
                }
              },
              {
                type: 'input',
                block_id: 'rationale',
                element: {
                  type: 'plain_text_input',
                  action_id: 'rationale_text',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Detailed reasoning, trade-offs, and expected outcomes'
                  },
                  multiline: true,
                  max_length: 1000
                },
                label: {
                  type: 'plain_text',
                  text: 'Rationale & Trade-offs'
                }
              },
              {
                type: 'input',
                block_id: 'stakeholders',
                element: {
                  type: 'multi_users_select',
                  action_id: 'stakeholders_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select stakeholders who should review this decision'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: 'Stakeholders'
                }
              },
              {
                type: 'input',
                block_id: 'deadline',
                element: {
                  type: 'datepicker',
                  action_id: 'deadline_date',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select decision deadline'
                  }
                },
                label: {
                  type: 'plain_text',
                  text: 'Decision Deadline'
                },
                optional: true
              }
            ],
            submit: {
              type: 'plain_text',
              text: 'Create Decision'
            },
            close: {
              type: 'plain_text',
              text: 'Cancel'
            }
          }
        });
        return;
      }

      if (action === 'list') {
        // List decisions with filtering
        const statusFilter = parts[1]; // draft, review, approved, implemented
        const decisions = await closApi.getDecisions(statusFilter, user.id);

        if (decisions.length === 0) {
          await respond({
            text: statusFilter 
              ? `📋 No decisions found with status "${statusFilter}".`
              : '📋 You haven\'t created any decision memos yet. Use `/decision` to create your first one!',
            response_type: 'ephemeral'
          });
          return;
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: statusFilter 
                ? `📋 *Your Decision Memos (${statusFilter})*`
                : '📋 *Your Decision Memos*'
            }
          },
          {
            type: 'divider'
          }
        ];

        for (const decision of decisions.slice(0, 10)) { // Limit to 10 for display
          const statusEmojis = {
            draft: '📝',
            review: '👀',
            approved: '✅',
            implemented: '🚀'
          };

          const deadlineText = decision.deadline 
            ? `\n*Deadline:* ${formatDate(decision.deadline)}`
            : '';

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${statusEmojis[decision.status]} *${decision.title}*
*Status:* ${decision.status.toUpperCase()}
*Decision Maker:* ${decision.decisionMaker}
*Stakeholders:* ${decision.stakeholders.length}
*Created:* ${formatDate(decision.createdAt)}${deadlineText}
_${decision.context.substring(0, 100)}${decision.context.length > 100 ? '...' : ''}_`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Details'
              },
              action_id: 'view_decision_details',
              value: decision.id
            }
          });
        }

        if (decisions.length > 10) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `_Showing 10 of ${decisions.length} decisions. Use filters to narrow results._`
            }
          });
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
                  text: 'Create New Decision'
                },
                action_id: 'create_new_decision',
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Team Decisions'
                },
                action_id: 'view_team_decisions'
              }
            ]
          }
        );

        await respond({
          text: `You have ${decisions.length} decision memo(s)`,
          blocks,
          response_type: 'ephemeral'
        });
      } else if (action === 'team') {
        // Show team decisions (public decisions)
        const decisions = await closApi.getDecisions(); // All decisions
        
        const pendingDecisions = decisions.filter(d => d.status === 'review');
        const recentDecisions = decisions.filter(d => d.status === 'approved' || d.status === 'implemented')
          .slice(0, 5);
        
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📋 *Team Decision Pipeline*\n\n*Pending Review:* ${pendingDecisions.length}\n*Total Decisions:* ${decisions.length}`
            }
          }
        ];

        if (pendingDecisions.length > 0) {
          blocks.push(
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Decisions Pending Review:*'
              }
            }
          );

          for (const decision of pendingDecisions.slice(0, 3)) {
            const deadlineWarning = decision.deadline && new Date(decision.deadline) < new Date() 
              ? ' ⚠️ *OVERDUE*' : '';

            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `👀 *${decision.title}*${deadlineWarning}\n_By ${decision.decisionMaker}_\n${decision.context.substring(0, 80)}...`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Review'
                },
                action_id: 'review_team_decision',
                value: decision.id
              }
            });
          }
        }

        if (recentDecisions.length > 0) {
          blocks.push(
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Recent Decisions:*'
              }
            }
          );

          for (const decision of recentDecisions) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *${decision.title}*\n_By ${decision.decisionMaker}_\n${decision.recommendation.substring(0, 80)}...`
              }
            });
          }
        }

        await respond({
          text: `Team has ${decisions.length} decisions with ${pendingDecisions.length} pending review`,
          blocks,
          response_type: 'in_channel'
        });
      } else {
        await respond({
          text: '❌ Unknown decision command. Use:\n• `/decision` - Create new decision memo\n• `/decision list` - View your decisions\n• `/decision team` - View team decisions',
          response_type: 'ephemeral'
        });
      }

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'used_decision_command',
        target: 'decisions',
        metadata: { command: text }
      });

    } catch (error) {
      logger.error('Decision command error:', error);
      await respond({
        text: '❌ Failed to process decision command. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle decision creation modal
  app.view('create_decision', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const userId = metadata.userId;

      const values = view.state.values;
      const title = values.title.title_text.value;
      const context = values.context.context_text.value;
      const options = values.options.options_text.value?.split('\n') || [];
      const recommendation = values.recommendation.recommendation_text.value;
      const rationale = values.rationale.rationale_text.value;
      const stakeholders = values.stakeholders.stakeholders_select.selected_users || [];
      const deadline = values.deadline.deadline_date.selected_date;

      const decisionData = {
        title,
        context,
        options,
        recommendation,
        rationale,
        decisionMaker: userId,
        stakeholders,
        deadline: deadline ? new Date(deadline) : undefined,
        status: 'draft' as const
      };

      const newDecision = await closApi.createDecision(decisionData);

      // Send confirmation to user
      const user = body.user.id;
      await client.chat.postMessage({
        channel: user,
        text: `📋 *Decision Memo Created Successfully!*\n\n*Title:* ${title}\n*ID:* ${newDecision.id}\n*Status:* DRAFT\n\nYour decision memo has been created. Share it with stakeholders for review when ready.`
      });

      // Notify stakeholders if any
      if (stakeholders.length > 0) {
        for (const stakeholder of stakeholders) {
          try {
            await client.chat.postMessage({
              channel: stakeholder,
              text: `📋 *New Decision Memo for Your Review*\n\n*Title:* ${title}\n*Decision Maker:* <@${user}>\n\n*Context:*\n${context}\n\n*Recommendation:*\n${recommendation}\n\nUse \`/decision list review\` to see all decisions pending your review.`
            });
          } catch (notifyError) {
            logger.warn(`Failed to notify stakeholder ${stakeholder}:`, notifyError);
          }
        }
      }

      // Log activity
      await closApi.logActivity({
        userId,
        action: 'created_decision',
        target: newDecision.id,
        metadata: { title, stakeholderCount: stakeholders.length }
      });

    } catch (error) {
      logger.error('Create decision error:', error);
      
      // Send error response
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to create decision memo. Please try again or contact support.'
      });
    }
  });

  // Handle decision detail view
  app.action('view_decision_details', async ({ ack, body, client }) => {
    await ack();

    try {
      const decisionId = (body as any).actions[0].value;
      const decisions = await closApi.getDecisions();
      const decision = decisions.find(d => d.id === decisionId);

      if (!decision) {
        return;
      }

      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📋 *${decision.title}*\n\n*Status:* ${decision.status.toUpperCase()}\n*Decision Maker:* ${decision.decisionMaker}\n*Created:* ${formatDate(decision.createdAt)}`
          }
        }
      ];

      if (decision.deadline) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Deadline:* ${formatDate(decision.deadline)}`
          }
        });
      }

      blocks.push(
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Context & Background:*\n${decision.context}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Options Considered:*\n${decision.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Recommendation:*\n${decision.recommendation}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Rationale:*\n${decision.rationale}`
          }
        }
      );

      if (decision.stakeholders.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stakeholders:*\n${decision.stakeholders.map(s => `• <@${s}>`).join('\n')}`
          }
        });
      }

      // Add action buttons based on status and user
      const actions = [];
      if (decision.status === 'draft') {
        actions.push({
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Submit for Review'
          },
          action_id: 'submit_decision_review',
          value: decisionId,
          style: 'primary'
        });
      } else if (decision.status === 'review') {
        actions.push(
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve'
            },
            action_id: 'approve_decision',
            value: decisionId,
            style: 'primary'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Request Changes'
            },
            action_id: 'request_decision_changes',
            value: decisionId
          }
        );
      }

      if (actions.length > 0) {
        blocks.push({
          type: 'actions',
          elements: actions
        });
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Decision Details'
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('View decision details error:', error);
    }
  });

  // Handle decision approval actions
  app.action('approve_decision', async ({ ack, body, respond }) => {
    await ack();

    try {
      const decisionId = (body as any).actions[0].value;
      await closApi.updateDecisionStatus(decisionId, 'approved');

      await respond({
        text: '✅ Decision approved successfully!',
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Approve decision error:', error);
      await respond({
        text: '❌ Failed to approve decision.',
        response_type: 'ephemeral'
      });
    }
  });
}