import { App } from '@slack/bolt';
import closApi from './closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export async function registerDailyReminders(app: App): Promise<void> {
  try {
    const client = app.client;
    
    // Send daily standup reminders
    await sendStandupReminders(client);
    
    // Send WIP limit warnings
    await sendWipWarnings(client);
    
    // Send blocker reminders
    await sendBlockerReminders(client);
    
    // Send demo preparation reminders
    await sendDemoReminders(client);

    logger.info('Daily reminders sent successfully');

  } catch (error) {
    logger.error('Daily reminders error:', error);
  }
}

async function sendStandupReminders(client: any): Promise<void> {
  try {
    // Get all users for reminder (this would be filtered by pod/team in production)
    // For now, send to general channel
    const standup_channel = '#general'; // Configure this
    
    await client.chat.postMessage({
      channel: standup_channel,
      text: '🌅 *Daily Standup Reminder*',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🌅 *Daily Standup Reminder*\n\nGood morning! Time to sync up with your pod.'
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📋 Pre-Standup Checklist:*\n• Run `/unblock` to check for blockers\n• Review your WIP with `/wip`\n• Prepare your updates (what you did, what you\'ll do, any blockers)\n• Check if you need help from others'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Quick Unblock Check'
              },
              action_id: 'reminder_quick_unblock',
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Check WIP Status'
              },
              action_id: 'reminder_check_wip'
            }
          ]
        }
      ]
    });

  } catch (error) {
    logger.error('Send standup reminders error:', error);
  }
}

async function sendWipWarnings(client: any): Promise<void> {
  try {
    // This would check all pods for WIP violations
    // For demo purposes, we'll simulate checking one pod
    const podName = 'engineering'; // This would iterate through all pods
    
    try {
      const wipStatus = await closApi.getWipStatus(podName);
      const utilization = wipStatus.totalWip / wipStatus.wipLimit;
      
      if (utilization >= 0.9) {
        const podChannel = `#${podName}-pod`;
        
        await client.chat.postMessage({
          channel: podChannel,
          text: '⚠️ *WIP Limit Warning*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⚠️ *WIP Limit Alert*\n\n*Pod:* ${podName}\n*Current WIP:* ${wipStatus.totalWip}/${wipStatus.wipLimit} (${(utilization * 100).toFixed(1)}%)\n\nYour pod is ${utilization >= 1 ? 'at' : 'approaching'} the WIP limit. Consider completing current work before starting new projects.`
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
                  action_id: 'reminder_view_projects',
                  value: podName
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Start Unblock Session'
                  },
                  action_id: 'reminder_start_unblock',
                  value: podName
                }
              ]
            }
          ]
        });
      }
    } catch (podError) {
      logger.warn(`Failed to check WIP for pod ${podName}:`, podError);
    }

  } catch (error) {
    logger.error('Send WIP warnings error:', error);
  }
}

async function sendBlockerReminders(client: any): Promise<void> {
  try {
    // Get all projects with blockers (this would be more targeted in production)
    const allProjects = await closApi.getProjects();
    const blockedProjects = allProjects.filter(p => p.blockers.length > 0);
    
    if (blockedProjects.length === 0) return;

    // Group by owner/pod
    const blockersByOwner: { [owner: string]: any[] } = {};
    
    for (const project of blockedProjects) {
      if (!blockersByOwner[project.owner]) {
        blockersByOwner[project.owner] = [];
      }
      blockersByOwner[project.owner].push(project);
    }

    // Send reminders to each owner
    for (const [owner, projects] of Object.entries(blockersByOwner)) {
      try {
        const user = await closApi.getUser(owner);
        if (!user) continue;

        const totalBlockers = projects.reduce((sum, p) => sum + p.blockers.length, 0);
        
        await client.chat.postMessage({
          channel: user.slackUserId,
          text: '🚫 *Daily Blocker Reminder*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚫 *Daily Blocker Reminder*\n\nGood morning! You have ${totalBlockers} blocker(s) across ${projects.length} project(s).`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Blocked Projects:*\n${projects.map(p => `• ${p.name} (${p.blockers.length} blocker${p.blockers.length !== 1 ? 's' : ''})`).join('\n')}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Start Unblock Session'
                  },
                  action_id: 'reminder_personal_unblock',
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Snooze Until Tomorrow'
                  },
                  action_id: 'reminder_snooze_blockers'
                }
              ]
            }
          ]
        });

      } catch (userError) {
        logger.warn(`Failed to send blocker reminder to ${owner}:`, userError);
      }
    }

  } catch (error) {
    logger.error('Send blocker reminders error:', error);
  }
}

async function sendDemoReminders(client: any): Promise<void> {
  try {
    // Get demo slots for today and tomorrow
    const demoSlots = await closApi.getDemoSlots();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    for (const daySlots of demoSlots) {
      const slotDate = new Date(daySlots.date);
      
      // Send 1-day reminders
      if (slotDate.toDateString() === tomorrow.toDateString()) {
        await sendDemoRemindersForDay(client, daySlots, '24-hour');
      }
      
      // Send same-day reminders (morning of demo)
      if (slotDate.toDateString() === today.toDateString()) {
        await sendDemoRemindersForDay(client, daySlots, 'same-day');
      }
    }

  } catch (error) {
    logger.error('Send demo reminders error:', error);
  }
}

async function sendDemoRemindersForDay(client: any, daySlots: any, reminderType: string): Promise<void> {
  try {
    const dayName = new Date(daySlots.date).toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });

    for (const [slot, signups] of Object.entries(daySlots.signups)) {
      if (!Array.isArray(signups) || signups.length === 0) continue;

      for (const presenter of signups) {
        try {
          // This would map presenter to Slack user ID
          const user = await getSlackUserForPresenter(presenter);
          if (!user) continue;

          const reminderTitle = reminderType === '24-hour' 
            ? '🎯 *Demo Tomorrow - Final Preparation*'
            : '🎯 *Demo Today - Ready to Present!*';

          const preparationTips = reminderType === '24-hour'
            ? '*Final Preparation:*\n• Test your demo thoroughly\n• Prepare your talking points\n• Set up your environment\n• Plan for Q&A\n• Have a backup ready'
            : '*Today\'s Checklist:*\n• Join 5 minutes early\n• Test your screen share\n• Have your demo ready to go\n• Prepare for questions\n• Relax and have fun!';

          await client.chat.postMessage({
            channel: user.slackUserId,
            text: reminderTitle,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `${reminderTitle}\n\n*Date:* ${dayName}\n*Time:* ${slot}\n*Project:* ${presenter.project || 'Your project'}`
                }
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: preparationTips
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: reminderType === '24-hour' ? 'Demo Guidelines' : 'Join Demo Room'
                    },
                    action_id: reminderType === '24-hour' ? 'reminder_demo_guidelines' : 'reminder_join_demo',
                    style: 'primary'
                  },
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Need Help?'
                    },
                    action_id: 'reminder_demo_help'
                  }
                ]
              }
            ]
          });

        } catch (presenterError) {
          logger.warn(`Failed to send demo reminder to presenter:`, presenterError);
        }
      }
    }

  } catch (error) {
    logger.error('Send demo reminders for day error:', error);
  }
}

// Handle reminder action buttons
export function registerReminderActions(app: App): void {
  app.action('reminder_quick_unblock', async ({ ack, body, respond }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);
      
      if (!user) {
        await respond({
          text: '❌ User not found in CLOS system.',
          response_type: 'ephemeral'
        });
        return;
      }

      const projects = await closApi.getProjects(user.id);
      const blockedProjects = projects.filter(p => p.blockers.length > 0);
      
      await respond({
        text: blockedProjects.length > 0 
          ? `🚫 You have ${blockedProjects.length} blocked project(s). Use \`/unblock\` for detailed management.`
          : `✅ No blocked projects! You're ready for standup.`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Reminder quick unblock error:', error);
      await respond({
        text: '❌ Failed to check blockers.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('reminder_check_wip', async ({ ack, body, respond }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);
      
      if (!user) {
        await respond({
          text: '❌ User not found in CLOS system.',
          response_type: 'ephemeral'
        });
        return;
      }

      const wipStatus = await closApi.getWipStatus(user.pod);
      const utilization = (wipStatus.totalWip / wipStatus.wipLimit) * 100;
      
      await respond({
        text: `📊 ${user.pod} Pod WIP: ${wipStatus.totalWip}/${wipStatus.wipLimit} (${utilization.toFixed(1)}%). Use \`/wip\` for details.`,
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Reminder check WIP error:', error);
      await respond({
        text: '❌ Failed to check WIP status.',
        response_type: 'ephemeral'
      });
    }
  });

  app.action('reminder_snooze_blockers', async ({ ack, body, respond }) => {
    await ack();
    
    await respond({
      text: '😴 Blocker reminders snoozed until tomorrow. Don\'t forget to tackle them!',
      response_type: 'ephemeral'
    });
  });

  app.action('reminder_demo_help', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      
      await client.chat.postMessage({
        channel: userId,
        text: '🆘 *Demo Help*\n\nNeed help with your demo? Here are some resources:\n\n• Use `/demo` command for guidelines\n• Contact demo coordinators in #demos channel\n• Ask your pod for feedback\n• Practice with a colleague\n\nYou\'ve got this! 🎯'
      });

    } catch (error) {
      logger.error('Reminder demo help error:', error);
    }
  });

  logger.info('Reminder action handlers registered');
}

// Utility functions
async function getSlackUserForPresenter(presenter: any): Promise<{ slackUserId: string } | null> {
  // This would map presenter info to Slack user
  // For now, return null - in production, you'd maintain this mapping
  return null;
}