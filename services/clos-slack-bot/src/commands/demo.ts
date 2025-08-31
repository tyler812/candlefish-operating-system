import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export function registerDemoCommand(app: App): void {
  app.command('/demo', async ({ command, ack, respond, client }) => {
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

      if (!text || action === 'signup' || action === 'register') {
        // Show available demo slots
        const demoSlots = await closApi.getDemoSlots();
        
        if (demoSlots.length === 0) {
          await respond({
            text: '📅 No demo slots are currently available. Check back later or contact your demo coordinator.',
            response_type: 'ephemeral'
          });
          return;
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🎯 *Demo Friday Sign-up*\n\nSelect a time slot to showcase your project to the team:'
            }
          },
          {
            type: 'divider'
          }
        ];

        for (const daySlots of demoSlots) {
          const date = new Date(daySlots.date);
          const dayName = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
          });

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📅 *${dayName}*`
            }
          });

          for (const slot of daySlots.slots) {
            const signups = daySlots.signups[slot] || [];
            const isAvailable = signups.length === 0;
            const statusEmoji = isAvailable ? '🟢' : '🔴';
            const statusText = isAvailable ? 'Available' : `Taken by ${signups[0]}`;

            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${statusEmoji} *${slot}* - ${statusText}`
              },
              accessory: isAvailable ? {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Sign Up'
                },
                action_id: 'signup_demo_slot',
                value: JSON.stringify({ date: daySlots.date, slot }),
                style: 'primary'
              } : undefined
            });
          }

          blocks.push({
            type: 'divider'
          });
        }

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Demo Guidelines:*\n• 5-10 minute presentation\n• Show working demo, not slides\n• Focus on user value and impact\n• Be prepared for Q&A\n• Cancel at least 24h in advance if needed'
          }
        });

        await respond({
          text: 'Demo Friday sign-up',
          blocks,
          response_type: 'ephemeral'
        });

      } else if (action === 'list' || action === 'schedule') {
        // Show current demo schedule
        const demoSlots = await closApi.getDemoSlots();
        
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🎯 *Demo Friday Schedule*'
            }
          },
          {
            type: 'divider'
          }
        ];

        let totalSignups = 0;
        for (const daySlots of demoSlots) {
          const date = new Date(daySlots.date);
          const dayName = date.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'short', 
            day: 'numeric' 
          });

          const daySignups = Object.values(daySlots.signups).flat();
          totalSignups += daySignups.length;

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📅 *${dayName}* (${daySignups.length} demo${daySignups.length !== 1 ? 's' : ''})`
            }
          });

          for (const slot of daySlots.slots) {
            const signups = daySlots.signups[slot] || [];
            if (signups.length > 0) {
              blocks.push({
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `   🎤 *${slot}* - ${signups[0]}`
                }
              });
            }
          }
        }

        if (totalSignups === 0) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '📭 No demos scheduled yet. Be the first to sign up!'
            }
          });
        }

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
                  text: 'Sign Up for Demo'
                },
                action_id: 'show_demo_signup',
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Demo Guidelines'
                },
                action_id: 'show_demo_guidelines'
              }
            ]
          }
        );

        await respond({
          text: `${totalSignups} demo(s) scheduled`,
          blocks,
          response_type: command.text.includes('public') ? 'in_channel' : 'ephemeral'
        });

      } else if (action === 'cancel') {
        // Cancel demo signup - would need to implement user's current signups
        await respond({
          text: '🔄 *Cancel Demo Signup*\n\n_Feature coming soon - contact demo coordinator to cancel your signup._',
          response_type: 'ephemeral'
        });

      } else {
        await respond({
          text: '❌ Unknown demo command. Use:\n• `/demo` - Sign up for demo slot\n• `/demo list` - View demo schedule\n• `/demo cancel` - Cancel your signup',
          response_type: 'ephemeral'
        });
      }

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'used_demo_command',
        target: 'demos',
        metadata: { command: text }
      });

    } catch (error) {
      logger.error('Demo command error:', error);
      await respond({
        text: '❌ Failed to process demo command. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle demo slot signup
  app.action('signup_demo_slot', async ({ ack, body, client }) => {
    await ack();

    try {
      const slotData = JSON.parse((body as any).actions[0].value);
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);
      
      if (!user) return;

      // Get user's projects to choose from
      const projects = await closApi.getProjects(user.id);
      
      if (projects.length === 0) {
        await client.chat.postMessage({
          channel: userId,
          text: '❌ You need to have an active project to sign up for a demo. Create a project first!'
        });
        return;
      }

      // Open project selection modal
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'demo_project_selection',
          private_metadata: JSON.stringify({ ...slotData, userId: user.id }),
          title: {
            type: 'plain_text',
            text: 'Select Demo Project'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎯 *Demo Slot: ${slotData.slot}*\n${new Date(slotData.date).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}\n\nWhich project will you be demoing?`
              }
            },
            {
              type: 'input',
              block_id: 'project',
              element: {
                type: 'static_select',
                action_id: 'project_select',
                placeholder: {
                  type: 'plain_text',
                  text: 'Select your project'
                },
                options: projects.map(project => ({
                  text: {
                    type: 'plain_text',
                    text: `${project.name} (${project.stage.toUpperCase()})`
                  },
                  value: project.id
                }))
              },
              label: {
                type: 'plain_text',
                text: 'Project to Demo'
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
                  text: 'Brief description of what you\'ll be showing...'
                },
                multiline: true,
                max_length: 300
              },
              label: {
                type: 'plain_text',
                text: 'Demo Description'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Sign Up'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Demo signup error:', error);
    }
  });

  // Handle demo project selection
  app.view('demo_project_selection', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const projectId = values.project.project_select.selected_option?.value;
      const description = values.description.description_text.value;
      
      if (!projectId) {
        return;
      }

      // Sign up for demo
      await closApi.signUpForDemo(
        metadata.userId,
        metadata.date,
        metadata.slot,
        projectId
      );

      // Send confirmation
      const user = body.user.id;
      const date = new Date(metadata.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric' 
      });

      await client.chat.postMessage({
        channel: user,
        text: `🎯 *Demo Sign-up Confirmed!*\n\n*Date:* ${date}\n*Time:* ${metadata.slot}\n*Project:* ${projectId}\n\n*Reminders:*\n• Prepare a 5-10 minute demo\n• Focus on user value and impact\n• Test your demo beforehand\n• Arrive 5 minutes early\n\nYou'll receive a reminder 1 day before your demo.`
      });

      // Post to demo channel
      const demoChannel = '#demos'; // Configure this
      try {
        await client.chat.postMessage({
          channel: demoChannel,
          text: `🎯 *New Demo Sign-up*\n\n*Presenter:* <@${user}>\n*Date:* ${date}\n*Time:* ${metadata.slot}\n*Project:* ${projectId}${description ? `\n*Description:* ${description}` : ''}`
        });
      } catch (channelError) {
        logger.warn('Failed to post to demo channel:', channelError);
      }

      // Log activity
      await closApi.logActivity({
        userId: metadata.userId,
        action: 'signed_up_for_demo',
        target: projectId,
        metadata: { date: metadata.date, slot: metadata.slot }
      });

    } catch (error) {
      logger.error('Demo project selection error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to sign up for demo. Please try again or contact support.'
      });
    }
  });

  // Handle demo guidelines
  app.action('show_demo_guidelines', async ({ ack, body, client }) => {
    await ack();

    try {
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Demo Guidelines'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎯 *Demo Friday Guidelines*

*Preparation:*
• Prepare a 5-10 minute presentation
• Show working software, not slides
• Focus on user value and business impact
• Test your demo beforehand
• Have a backup plan for technical issues

*Content:*
• Start with the problem you're solving
• Show the solution in action
• Highlight key features and benefits
• Share metrics or user feedback if available
• End with next steps or call for feedback

*Presentation Tips:*
• Arrive 5 minutes early
• Speak clearly and at a good pace
• Engage with your audience
• Be prepared for Q&A
• Keep it interactive and fun

*Logistics:*
• Demos are recorded for future reference
• Slides are optional but keep them minimal
• You can invite stakeholders or users
• Cancel at least 24h in advance if needed

*Questions?*
Contact your demo coordinator or ask in #demos channel.`
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
      logger.error('Show demo guidelines error:', error);
    }
  });

  // Handle show demo signup button
  app.action('show_demo_signup', async ({ ack, body, client }) => {
    await ack();
    
    // Trigger the same flow as /demo command
    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);
      
      if (!user) return;

      const demoSlots = await closApi.getDemoSlots();
      
      if (demoSlots.length === 0) {
        await client.chat.postMessage({
          channel: userId,
          text: '📅 No demo slots are currently available. Check back later or contact your demo coordinator.'
        });
        return;
      }

      // Show available slots (reuse logic from main command)
      const blocks = [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🎯 *Demo Friday Sign-up*\n\nSelect a time slot to showcase your project:'
          }
        }
      ];

      for (const daySlots of demoSlots) {
        const date = new Date(daySlots.date);
        const dayName = date.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric' 
        });

        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📅 *${dayName}*`
          }
        });

        for (const slot of daySlots.slots) {
          const signups = daySlots.signups[slot] || [];
          const isAvailable = signups.length === 0;
          
          if (isAvailable) {
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🟢 *${slot}* - Available`
              },
              accessory: {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Sign Up'
                },
                action_id: 'signup_demo_slot',
                value: JSON.stringify({ date: daySlots.date, slot }),
                style: 'primary'
              }
            });
          }
        }
      }

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Demo Sign-up'
          },
          blocks,
          close: {
            type: 'plain_text',
            text: 'Close'
          }
        }
      });

    } catch (error) {
      logger.error('Show demo signup button error:', error);
    }
  });
}