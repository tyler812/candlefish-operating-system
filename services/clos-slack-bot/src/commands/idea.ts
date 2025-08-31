import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate, calculatePriority } from '../utils/helpers';

export function registerIdeaCommand(app: App): void {
  app.command('/idea', async ({ command, ack, respond, client }) => {
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

      if (!text || action === 'submit' || action === 'add' || action === 'new') {
        // Open idea submission modal
        await client.views.open({
          trigger_id: command.trigger_id,
          view: {
            type: 'modal',
            callback_id: 'submit_idea',
            private_metadata: JSON.stringify({ userId: user.id }),
            title: {
              type: 'plain_text',
              text: 'Submit New Idea'
            },
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '💡 *Share your idea with the team*\n\nAll ideas are reviewed and prioritized based on impact and effort.'
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
                    text: 'Brief, descriptive title for your idea'
                  },
                  max_length: 100
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
                    text: 'Describe your idea, the problem it solves, and potential benefits...'
                  },
                  multiline: true,
                  max_length: 1000
                },
                label: {
                  type: 'plain_text',
                  text: 'Description'
                }
              },
              {
                type: 'input',
                block_id: 'impact',
                element: {
                  type: 'static_select',
                  action_id: 'impact_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select expected impact'
                  },
                  options: [
                    {
                      text: {
                        type: 'plain_text',
                        text: '1 - Low Impact'
                      },
                      value: '1'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '2 - Medium Impact'
                      },
                      value: '2'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '3 - High Impact'
                      },
                      value: '3'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '4 - Very High Impact'
                      },
                      value: '4'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '5 - Critical Impact'
                      },
                      value: '5'
                    }
                  ]
                },
                label: {
                  type: 'plain_text',
                  text: 'Expected Impact (1-5)'
                }
              },
              {
                type: 'input',
                block_id: 'effort',
                element: {
                  type: 'static_select',
                  action_id: 'effort_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select estimated effort'
                  },
                  options: [
                    {
                      text: {
                        type: 'plain_text',
                        text: '1 - Minimal (1-2 days)'
                      },
                      value: '1'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '2 - Small (1 week)'
                      },
                      value: '2'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '3 - Medium (2-4 weeks)'
                      },
                      value: '3'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '4 - Large (1-2 months)'
                      },
                      value: '4'
                    },
                    {
                      text: {
                        type: 'plain_text',
                        text: '5 - Very Large (3+ months)'
                      },
                      value: '5'
                    }
                  ]
                },
                label: {
                  type: 'plain_text',
                  text: 'Estimated Effort (1-5)'
                }
              }
            ],
            submit: {
              type: 'plain_text',
              text: 'Submit Idea'
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
        // List ideas with filtering
        const statusFilter = parts[1]; // submitted, approved, rejected, etc.
        const ideas = await closApi.getIdeas(statusFilter, user.id);

        if (ideas.length === 0) {
          await respond({
            text: statusFilter 
              ? `📋 No ideas found with status "${statusFilter}".`
              : '📋 You haven\'t submitted any ideas yet. Use `/idea` to submit your first idea!',
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
                ? `💡 *Your Ideas (${statusFilter})*`
                : '💡 *Your Ideas*'
            }
          },
          {
            type: 'divider'
          }
        ];

        for (const idea of ideas.slice(0, 10)) { // Limit to 10 for display
          const priorityEmojis = {
            low: '🔵',
            medium: '🟡',
            high: '🟠',
            critical: '🔴'
          };

          const statusEmojis = {
            submitted: '📝',
            reviewing: '👀',
            approved: '✅',
            rejected: '❌',
            'in-progress': '🚧'
          };

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${statusEmojis[idea.status]} *${idea.title}*
*Priority:* ${priorityEmojis[idea.priority]} ${idea.priority.toUpperCase()}
*Status:* ${idea.status.replace('-', ' ').toUpperCase()}
*Impact/Effort:* ${idea.potentialImpact}/${idea.estimatedEffort}
*Submitted:* ${formatDate(idea.createdAt)}
_${idea.description.substring(0, 100)}${idea.description.length > 100 ? '...' : ''}_`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Details'
              },
              action_id: 'view_idea_details',
              value: idea.id
            }
          });
        }

        if (ideas.length > 10) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `_Showing 10 of ${ideas.length} ideas. Use filters to narrow results._`
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
                  text: 'Submit New Idea'
                },
                action_id: 'submit_new_idea',
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View All Team Ideas'
                },
                action_id: 'view_all_ideas'
              }
            ]
          }
        );

        await respond({
          text: `You have ${ideas.length} idea(s)`,
          blocks,
          response_type: 'ephemeral'
        });
      } else if (action === 'team') {
        // Show team ideas (public ideas)
        const ideas = await closApi.getIdeas(); // All ideas
        
        const approvedIdeas = ideas.filter(i => i.status === 'approved');
        const inProgressIdeas = ideas.filter(i => i.status === 'in-progress');
        
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚀 *Team Idea Pipeline*\n\n*Approved Ideas:* ${approvedIdeas.length}\n*In Progress:* ${inProgressIdeas.length}\n*Total Ideas:* ${ideas.length}`
            }
          }
        ];

        if (approvedIdeas.length > 0) {
          blocks.push(
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Recent Approved Ideas:*'
              }
            }
          );

          for (const idea of approvedIdeas.slice(0, 5)) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `✅ *${idea.title}*\n_By ${idea.submitter}_\n${idea.description.substring(0, 80)}...`
              }
            });
          }
        }

        await respond({
          text: `Team has ${ideas.length} ideas in the pipeline`,
          blocks,
          response_type: 'in_channel'
        });
      } else {
        await respond({
          text: '❌ Unknown idea command. Use:\n• `/idea` - Submit new idea\n• `/idea list` - View your ideas\n• `/idea team` - View team ideas',
          response_type: 'ephemeral'
        });
      }

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'used_idea_command',
        target: 'ideas',
        metadata: { command: text }
      });

    } catch (error) {
      logger.error('Idea command error:', error);
      await respond({
        text: '❌ Failed to process idea command. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle idea submission modal
  app.view('submit_idea', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const userId = metadata.userId;

      const values = view.state.values;
      const title = values.title.title_text.value;
      const description = values.description.description_text.value;
      const potentialImpact = parseInt(values.impact.impact_select.selected_option?.value || '1');
      const estimatedEffort = parseInt(values.effort.effort_select.selected_option?.value || '1');

      const priority = calculatePriority(potentialImpact, estimatedEffort);

      const ideaData = {
        title,
        description,
        submitter: userId,
        priority,
        status: 'submitted' as const,
        estimatedEffort,
        potentialImpact
      };

      const newIdea = await closApi.submitIdea(ideaData);

      // Send confirmation to user
      const user = body.user.id;
      await client.chat.postMessage({
        channel: user,
        text: `🎉 *Idea Submitted Successfully!*\n\n*Title:* ${title}\n*Priority:* ${priority.toUpperCase()}\n*ID:* ${newIdea.id}\n\nYour idea has been added to the review queue. You'll be notified when it's reviewed.`
      });

      // Post to ideas channel (if configured)
      const ideasChannel = '#ideas'; // Configure this
      try {
        await client.chat.postMessage({
          channel: ideasChannel,
          text: `💡 *New Idea Submitted*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💡 *New Idea: ${title}*\n\n*Submitted by:* <@${user}>\n*Priority:* ${priority.toUpperCase()}\n*Impact/Effort:* ${potentialImpact}/${estimatedEffort}\n\n*Description:*\n${description}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Approve'
                  },
                  action_id: 'approve_idea',
                  value: newIdea.id,
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Review Later'
                  },
                  action_id: 'review_idea_later',
                  value: newIdea.id
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Reject'
                  },
                  action_id: 'reject_idea',
                  value: newIdea.id,
                  style: 'danger'
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to post to ideas channel:', channelError);
      }

      // Log activity
      await closApi.logActivity({
        userId,
        action: 'submitted_idea',
        target: newIdea.id,
        metadata: { title, priority }
      });

    } catch (error) {
      logger.error('Submit idea error:', error);
      
      // Send error response
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to submit idea. Please try again or contact support.'
      });
    }
  });

  // Handle idea action buttons
  app.action('view_idea_details', async ({ ack, body, client }) => {
    await ack();

    try {
      const ideaId = (body as any).actions[0].value;
      const ideas = await closApi.getIdeas();
      const idea = ideas.find(i => i.id === ideaId);

      if (!idea) {
        return;
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Idea Details'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💡 *${idea.title}*\n\n*Status:* ${idea.status.toUpperCase()}\n*Priority:* ${idea.priority.toUpperCase()}\n*Submitted by:* ${idea.submitter}\n*Impact/Effort:* ${idea.potentialImpact}/${idea.estimatedEffort}\n*Submitted:* ${formatDate(idea.createdAt)}\n\n*Description:*\n${idea.description}`
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
      logger.error('View idea details error:', error);
    }
  });

  app.action('submit_new_idea', async ({ ack, body, client }) => {
    await ack();
    
    // Trigger the idea submission modal (reuse the same modal)
    try {
      const user = await closApi.getUser((body as any).user.id);
      if (!user) return;

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'submit_idea',
          private_metadata: JSON.stringify({ userId: user.id }),
          title: {
            type: 'plain_text',
            text: 'Submit New Idea'
          },
          blocks: [
            // ... same blocks as above
          ],
          submit: {
            type: 'plain_text',
            text: 'Submit Idea'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });
    } catch (error) {
      logger.error('Submit new idea button error:', error);
    }
  });
}