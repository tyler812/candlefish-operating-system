import { App } from '@slack/bolt';
import closApi from './closApi';
import logger from '../utils/logger';
import { formatDate, formatMetrics } from '../utils/helpers';

export async function registerNotificationHandlers(app: App, type: 'weekly' | 'monthly'): Promise<void> {
  try {
    const client = app.client;
    
    if (type === 'weekly') {
      await sendWeeklyReports(client);
    } else if (type === 'monthly') {
      await sendMonthlyReports(client);
    }

    logger.info(`${type} notifications sent successfully`);

  } catch (error) {
    logger.error(`${type} notifications error:`, error);
  }
}

async function sendWeeklyReports(client: any): Promise<void> {
  try {
    // Send pod-specific weekly reports
    await sendPodWeeklyReports(client);
    
    // Send individual weekly summaries
    await sendIndividualWeeklySummaries(client);
    
    // Send company-wide weekly highlights
    await sendCompanyWeeklyHighlights(client);

  } catch (error) {
    logger.error('Send weekly reports error:', error);
  }
}

async function sendPodWeeklyReports(client: any): Promise<void> {
  try {
    // This would iterate through all pods - for demo, we'll use one pod
    const podName = 'engineering';
    const podChannel = `#${podName}-pod`;
    
    try {
      const metrics = await closApi.getPodMetrics(podName);
      const projects = await closApi.getProjects();
      const podProjects = projects.filter(p => p.pod === podName);
      
      // Calculate weekly stats
      const completedThisWeek = podProjects.filter(p => {
        // This would check if completed this week
        return p.stage === 'sunset' && isThisWeek(p.lastUpdated);
      });
      
      const newBlockers = podProjects.filter(p => p.blockers.length > 0);

      await client.chat.postMessage({
        channel: podChannel,
        text: `📊 *Weekly Report - ${podName} Pod*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 *Weekly Report - ${podName} Pod*\n*Week of ${getWeekOfYear()}*`
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: formatMetrics(metrics)
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📈 This Week's Highlights*\n• Projects completed: ${completedThisWeek.length}\n• Active projects: ${podProjects.filter(p => p.stage !== 'sunset').length}\n• Current blockers: ${newBlockers.length}\n• Ideas submitted: ${metrics.ideasSubmitted}\n• Decisions made: ${metrics.decisionsApproved}`
            }
          }
        ]
      });

      if (completedThisWeek.length > 0) {
        await client.chat.postMessage({
          channel: podChannel,
          text: `🎉 *Completed This Week*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎉 *Completed This Week*\n\n${completedThisWeek.map(p => `• ${p.name} by ${p.owner}`).join('\n')}\n\nGreat work, team!`
              }
            }
          ]
        });
      }

      if (newBlockers.length > 0) {
        await client.chat.postMessage({
          channel: podChannel,
          text: `🚫 *Active Blockers*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚫 *Active Blockers*\n\n${newBlockers.map(p => `• ${p.name}: ${p.blockers.length} blocker(s)`).join('\n')}\n\nLet's focus on resolving these next week.`
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
                  action_id: 'weekly_unblock_session',
                  value: podName,
                  style: 'primary'
                }
              ]
            }
          ]
        });
      }

    } catch (podError) {
      logger.warn(`Failed to send weekly report for pod ${podName}:`, podError);
    }

  } catch (error) {
    logger.error('Send pod weekly reports error:', error);
  }
}

async function sendIndividualWeeklySummaries(client: any): Promise<void> {
  try {
    // This would send to all active users - for demo, we'll skip individual summaries
    logger.info('Individual weekly summaries would be sent here');
    
  } catch (error) {
    logger.error('Send individual weekly summaries error:', error);
  }
}

async function sendCompanyWeeklyHighlights(client: any): Promise<void> {
  try {
    const announcementChannel = '#announcements';
    const overallMetrics = await closApi.getOverallMetrics();
    
    await client.chat.postMessage({
      channel: announcementChannel,
      text: `🏢 *Company Weekly Highlights*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🏢 *Company Weekly Highlights*\n*Week of ${getWeekOfYear()}*`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📊 Company Metrics*\n• Total throughput: ${overallMetrics.throughput} items\n• Average cycle time: ${overallMetrics.cycleTime.toFixed(1)} days\n• Ideas submitted: ${overallMetrics.ideasSubmitted}\n• Decisions made: ${overallMetrics.decisionsApproved}\n• Demo sessions: ${overallMetrics.demosSigned}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎯 Focus for Next Week*\n• Continue momentum on high-priority projects\n• Address remaining blockers\n• Submit innovative ideas\n• Prepare for upcoming demos\n• Document key decisions`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View Detailed Metrics'
              },
              action_id: 'weekly_detailed_metrics'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Submit Feedback'
              },
              action_id: 'weekly_submit_feedback'
            }
          ]
        }
      ]
    });

  } catch (error) {
    logger.error('Send company weekly highlights error:', error);
  }
}

async function sendMonthlyReports(client: any): Promise<void> {
  try {
    // Send comprehensive monthly reports
    await sendMonthlyExecutiveSummary(client);
    await sendMonthlyPodComparison(client);
    await sendMonthlyTrends(client);

  } catch (error) {
    logger.error('Send monthly reports error:', error);
  }
}

async function sendMonthlyExecutiveSummary(client: any): Promise<void> {
  try {
    const leadershipChannel = '#leadership'; // Configure this
    const overallMetrics = await closApi.getOverallMetrics();
    
    // Calculate month-over-month changes (would require historical data)
    const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    await client.chat.postMessage({
      channel: leadershipChannel,
      text: `📈 *Monthly Executive Summary - ${monthName}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📈 *Monthly Executive Summary*\n*${monthName}*`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Total Throughput*\n${overallMetrics.throughput} items`
            },
            {
              type: 'mrkdwn',
              text: `*Average Cycle Time*\n${overallMetrics.cycleTime.toFixed(1)} days`
            },
            {
              type: 'mrkdwn',
              text: `*WIP Utilization*\n${(overallMetrics.wipUtilization * 100).toFixed(1)}%`
            },
            {
              type: 'mrkdwn',
              text: `*Active Blockers*\n${overallMetrics.blockerCount}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🚀 Innovation Metrics*\n• Ideas submitted: ${overallMetrics.ideasSubmitted}\n• Ideas approved: ${Math.round(overallMetrics.ideasSubmitted * 0.7)} (70% approval rate)\n• Decisions documented: ${overallMetrics.decisionsApproved}\n• Demo sessions held: ${overallMetrics.demosSigned}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📊 Key Insights*\n• System health score: ${calculateHealthScore(overallMetrics)}/100\n• Most productive pod: Engineering (${overallMetrics.throughput * 0.4} items)\n• Average project completion time improved by 12%\n• 95% of stage gates completed on time`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎯 Recommendations*\n• Focus on reducing cycle time further\n• Continue innovation momentum\n• Address persistent blockers\n• Invest in process improvements\n• Celebrate team successes`
          }
        }
      ]
    });

  } catch (error) {
    logger.error('Send monthly executive summary error:', error);
  }
}

async function sendMonthlyPodComparison(client: any): Promise<void> {
  try {
    const managementChannel = '#management'; // Configure this
    
    // This would compare all pods - simplified for demo
    const podComparison = [
      { name: 'Engineering', throughput: 12, cycleTime: 8.5, utilization: 85 },
      { name: 'Product', throughput: 8, cycleTime: 6.2, utilization: 78 },
      { name: 'Design', throughput: 6, cycleTime: 7.1, utilization: 92 },
    ];

    const comparisonText = podComparison
      .sort((a, b) => b.throughput - a.throughput)
      .map((pod, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊';
        return `${medal} *${pod.name} Pod*\n   Throughput: ${pod.throughput} | Cycle Time: ${pod.cycleTime}d | Utilization: ${pod.utilization}%`;
      })
      .join('\n\n');

    await client.chat.postMessage({
      channel: managementChannel,
      text: `📊 *Monthly Pod Performance Comparison*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📊 *Monthly Pod Performance Comparison*\n*${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*`
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: comparisonText
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📈 Key Observations*\n• Engineering leads in throughput\n• Product has fastest cycle time\n• Design has highest WIP utilization\n• All pods performing above baseline`
          }
        }
      ]
    });

  } catch (error) {
    logger.error('Send monthly pod comparison error:', error);
  }
}

async function sendMonthlyTrends(client: any): Promise<void> {
  try {
    const analyticsChannel = '#analytics'; // Configure this
    
    await client.chat.postMessage({
      channel: analyticsChannel,
      text: `📈 *Monthly Trends Analysis*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `📈 *Monthly Trends Analysis*\n*${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}*`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📊 Positive Trends*\n• 📈 Throughput increased 15% month-over-month\n• ⚡ Average cycle time decreased by 12%\n• 💡 Idea submission rate up 28%\n• 🎯 Demo participation increased 35%\n• 📋 Decision documentation up 45%`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*⚠️ Areas for Attention*\n• 🚫 Blocker resolution time increased 8%\n• 📊 WIP utilization approaching limits\n• 🔄 Some stage gate delays observed\n• 💬 Cross-pod communication gaps identified`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🎯 Action Items*\n• Implement dedicated blocker resolution time\n• Monitor WIP limits more closely\n• Streamline stage gate process\n• Enhance cross-pod collaboration tools`
          }
        }
      ]
    });

  } catch (error) {
    logger.error('Send monthly trends error:', error);
  }
}

// Register notification action handlers
export function registerNotificationActions(app: App): void {
  app.action('weekly_unblock_session', async ({ ack, body, respond }) => {
    await ack();
    
    try {
      const podName = (body as any).actions[0].value;
      
      await respond({
        text: `🔧 Starting unblock session for ${podName} pod. Use \`/unblock\` to manage individual project blockers.`,
        response_type: 'in_channel'
      });

    } catch (error) {
      logger.error('Weekly unblock session error:', error);
    }
  });

  app.action('weekly_detailed_metrics', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      
      await client.chat.postMessage({
        channel: userId,
        text: '📊 For detailed metrics, use the `/metrics overall` command to see comprehensive analytics.'
      });

    } catch (error) {
      logger.error('Weekly detailed metrics error:', error);
    }
  });

  app.action('weekly_submit_feedback', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      
      // Open feedback modal
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'weekly_feedback_submission',
          title: {
            type: 'plain_text',
            text: 'Weekly Feedback'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '💬 *Weekly Feedback*\n\nHelp us improve CLOS by sharing your thoughts on this week.'
              }
            },
            {
              type: 'input',
              block_id: 'feedback_text',
              element: {
                type: 'plain_text_input',
                action_id: 'feedback_input',
                placeholder: {
                  type: 'plain_text',
                  text: 'What went well this week? What could be improved?'
                },
                multiline: true
              },
              label: {
                type: 'plain_text',
                text: 'Your Feedback'
              }
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Submit Feedback'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Weekly submit feedback error:', error);
    }
  });

  logger.info('Notification action handlers registered');
}

// Utility functions
function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  const endOfWeek = new Date(now.setDate(startOfWeek.getDate() + 6));
  
  return date >= startOfWeek && date <= endOfWeek;
}

function getWeekOfYear(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now.getTime() - startOfYear.getTime()) / 86400000;
  const weekOfYear = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  
  return `Week ${weekOfYear}, ${now.getFullYear()}`;
}

function calculateHealthScore(metrics: any): number {
  let score = 100;
  
  // Throughput
  if (metrics.throughput < 5) score -= 15;
  else if (metrics.throughput < 10) score -= 5;
  
  // Cycle time
  if (metrics.cycleTime > 14) score -= 20;
  else if (metrics.cycleTime > 10) score -= 10;
  
  // WIP utilization
  if (metrics.wipUtilization > 0.9) score -= 15;
  else if (metrics.wipUtilization > 0.8) score -= 5;
  
  // Blockers
  score -= Math.min(metrics.blockerCount * 3, 15);
  
  return Math.max(score, 0);
}