import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate, formatMetrics, createProgressBar } from '../utils/helpers';

export function registerHomeTabHandler(app: App): void {
  
  // Handle home tab opened event
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      if (event.tab !== 'home') return;

      const userId = event.user;
      const user = await closApi.getUser(userId);

      if (!user) {
        // Show onboarding for new users
        await showOnboardingHomeTab(client, userId);
        return;
      }

      // Show personalized dashboard
      await showPersonalizedHomeTab(client, userId, user);

    } catch (error) {
      logger.error('Home tab opened error:', error);
    }
  });

  // Handle home tab interactions
  app.action('home_refresh', async ({ ack, body, client }) => {
    await ack();

    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);

      if (user) {
        await showPersonalizedHomeTab(client, userId, user);
      }

    } catch (error) {
      logger.error('Home tab refresh error:', error);
    }
  });

  // Handle quick action buttons from home tab
  app.action('home_quick_unblock', async ({ ack, body, client }) => {
    await ack();

    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);

      if (!user) return;

      const projects = await closApi.getProjects(user.id);
      const blockedProjects = projects.filter(p => p.blockers.length > 0);

      if (blockedProjects.length === 0) {
        await client.chat.postMessage({
          channel: userId,
          text: '✅ No blocked projects! You\'re all clear. Great work!'
        });
      } else {
        await client.chat.postMessage({
          channel: userId,
          text: `🚫 You have ${blockedProjects.length} blocked project(s). Use \`/unblock\` to resolve them.`
        });
      }

      // Refresh home tab
      await showPersonalizedHomeTab(client, userId, user);

    } catch (error) {
      logger.error('Home quick unblock error:', error);
    }
  });

  app.action('home_view_wip', async ({ ack, body, client }) => {
    await ack();

    try {
      const userId = (body as any).user.id;
      const user = await closApi.getUser(userId);

      if (!user) return;

      await client.chat.postMessage({
        channel: userId,
        text: `📊 Use \`/wip\` to see detailed WIP status for ${user.pod} pod.`
      });

    } catch (error) {
      logger.error('Home view WIP error:', error);
    }
  });

  app.action('home_submit_idea', async ({ ack, body, client }) => {
    await ack();

    try {
      const userId = (body as any).user.id;

      await client.chat.postMessage({
        channel: userId,
        text: '💡 Use `/idea` command to submit a new idea with the full submission form.'
      });

    } catch (error) {
      logger.error('Home submit idea error:', error);
    }
  });

  // Show onboarding home tab for new users
  async function showOnboardingHomeTab(client: any, userId: string): Promise<void> {
    try {
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '👋 *Welcome to CLOS Slack Bot!*\n\nI\'m here to help you manage the Candlefish Operating System workflow right from Slack.'
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🚀 Getting Started*\n\nFirst, let\'s get you set up in the CLOS system. You\'ll need to be added by your administrator.'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*📋 Available Commands:*\n• `/unblock` - Manage project blockers\n• `/wip` - Check Work-in-Progress status\n• `/stage` - Manage stage gates\n• `/idea` - Submit and track ideas\n• `/decision` - Create decision memos\n• `/demo` - Sign up for Demo Friday\n• `/metrics` - View performance metrics\n• `/help` - Get detailed help'
              }
            },
            {
              type: 'divider'
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*🎯 Quick Actions*'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Get Help'
                  },
                  action_id: 'onboarding_help',
                  style: 'primary'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Contact Support'
                  },
                  action_id: 'onboarding_support'
                }
              ]
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '_CLOS Bot v2.0 | This tab will show your personalized dashboard once you\'re set up in the system._'
                }
              ]
            }
          ]
        }
      });

    } catch (error) {
      logger.error('Show onboarding home tab error:', error);
    }
  }

  // Show personalized dashboard for existing users
  async function showPersonalizedHomeTab(client: any, userId: string, user: any): Promise<void> {
    try {
      // Get user's data
      const projects = await closApi.getProjects(user.id);
      const ideas = await closApi.getIdeas(undefined, user.id);
      const decisions = await closApi.getDecisions(undefined, user.id);
      const podMetrics = await closApi.getPodMetrics(user.pod);

      // Calculate user stats
      const activeProjects = projects.filter(p => p.stage !== 'sunset');
      const blockedProjects = projects.filter(p => p.blockers.length > 0);
      const approvedIdeas = ideas.filter(i => i.status === 'approved');
      const pendingDecisions = decisions.filter(d => d.status === 'review');

      // Create WIP progress bar for pod
      const wipBar = createProgressBar(podMetrics.wipUtilization, 1, 10);
      const wipStatus = podMetrics.wipUtilization >= 1.0 ? '🔴 AT LIMIT' : 
                       podMetrics.wipUtilization >= 0.8 ? '🟡 HIGH' : '🟢 HEALTHY';

      const blocks = [
        // Header
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `👋 *Welcome back, ${user.name}!*\n*Pod:* ${user.pod} | *Role:* ${user.role}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔄 Refresh'
              },
              action_id: 'home_refresh'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '⚙️ Settings'
              },
              action_id: 'home_settings'
            }
          ]
        },
        {
          type: 'divider'
        },
        
        // Quick Stats
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*📊 Your Quick Stats*'
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Active Projects*\n${activeProjects.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Blocked Projects*\n${blockedProjects.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Ideas Submitted*\n${ideas.length}`
            },
            {
              type: 'mrkdwn',
              text: `*Ideas Approved*\n${approvedIdeas.length}`
            }
          ]
        }
      ];

      // Pod WIP Status
      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎯 ${user.pod} Pod WIP Status*\n\n${wipStatus} ${(podMetrics.wipUtilization * 100).toFixed(1)}%\n${wipBar}`
          },
          accessory: {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View Details'
            },
            action_id: 'home_view_wip'
          }
        }
      );

      // Blocked Projects Alert
      if (blockedProjects.length > 0) {
        blocks.push(
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚫 *${blockedProjects.length} Project(s) Blocked*\n${blockedProjects.slice(0, 3).map(p => `• ${p.name}`).join('\n')}${blockedProjects.length > 3 ? `\n• ...and ${blockedProjects.length - 3} more` : ''}`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Resolve Blockers'
              },
              action_id: 'home_quick_unblock',
              style: 'danger'
            }
          }
        );
      }

      // Recent Activity Section
      const recentActivities = await closApi.getRecentActivities(5);
      if (recentActivities.length > 0) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📈 Recent Activity*'
            }
          }
        );

        for (const activity of recentActivities.slice(0, 3)) {
          const activityEmoji = getActivityEmoji(activity.action);
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${activityEmoji} ${formatActivity(activity)}`
            }
          });
        }
      }

      // Quick Actions
      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*⚡ Quick Actions*'
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '💡 Submit Idea'
              },
              action_id: 'home_submit_idea',
              style: 'primary'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🎯 Sign up for Demo'
              },
              action_id: 'home_demo_signup'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '📋 Create Decision'
              },
              action_id: 'home_create_decision'
            }
          ]
        }
      );

      // Pending Items
      if (pendingDecisions.length > 0) {
        blocks.push(
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*⏰ Pending Review*\n\n${pendingDecisions.length} decision(s) waiting for your review`
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Review Now'
              },
              action_id: 'home_review_decisions'
            }
          }
        );
      }

      // Helpful Tips
      const tips = [
        'Use `/help` to see all available commands',
        'Check `/wip` daily to monitor your pod\'s capacity',
        'Run `/unblock` first thing in the morning to tackle blockers',
        'Submit ideas regularly with `/idea` to drive innovation',
        'Use `/metrics` to track your pod\'s performance trends'
      ];

      const randomTip = tips[Math.floor(Math.random() * tips.length)];

      blocks.push(
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*💡 Tip of the Day*\n${randomTip}`
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_Last updated: ${formatDate(new Date())} | CLOS Bot v2.0_`
            }
          ]
        }
      );

      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks
        }
      });

      // Log activity
      await closApi.logActivity({
        userId: user.id,
        action: 'viewed_home_dashboard',
        target: 'home',
        metadata: { 
          projectCount: projects.length, 
          blockerCount: blockedProjects.length 
        }
      });

    } catch (error) {
      logger.error('Show personalized home tab error:', error);
      
      // Fallback to simple view
      await client.views.publish({
        user_id: userId,
        view: {
          type: 'home',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Dashboard Temporarily Unavailable*\n\nSorry, there was an error loading your dashboard. Please try refreshing or use the command interface.\n\nUse `/help` to see available commands.'
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Retry'
                  },
                  action_id: 'home_refresh'
                }
              ]
            }
          ]
        }
      });
    }
  }

  // Utility functions
  function getActivityEmoji(action: string): string {
    const emojiMap: { [key: string]: string } = {
      'submitted_idea': '💡',
      'created_decision': '📋',
      'requested_stage_advancement': '🎯',
      'resolved_blocker': '✅',
      'added_blocker': '🚫',
      'signed_up_for_demo': '🎤',
      'approved_idea': '👍',
      'started_unblock_session': '🔧'
    };
    
    return emojiMap[action] || '📌';
  }

  function formatActivity(activity: any): string {
    const actionMap: { [key: string]: string } = {
      'submitted_idea': 'submitted an idea',
      'created_decision': 'created a decision memo',
      'requested_stage_advancement': 'requested stage advancement',
      'resolved_blocker': 'resolved a blocker',
      'added_blocker': 'added a blocker',
      'signed_up_for_demo': 'signed up for demo',
      'approved_idea': 'approved an idea',
      'started_unblock_session': 'started unblock session'
    };
    
    const actionText = actionMap[activity.action] || activity.action;
    const timeAgo = getTimeAgo(new Date(activity.timestamp));
    
    return `${actionText} ${timeAgo}`;
  }

  function getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  }

  logger.info('Home tab handlers registered');
}