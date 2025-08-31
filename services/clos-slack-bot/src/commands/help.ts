import { App } from '@slack/bolt';
import logger from '../utils/logger';

export function registerHelpCommand(app: App): void {
  app.command('/help', async ({ command, ack, respond, client }) => {
    await ack();

    try {
      const text = command.text.trim();
      const topic = text.toLowerCase();

      if (!text) {
        // Show general help
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🤖 *CLOS Slack Bot - Help Center*\n\nI help you manage the Candlefish Operating System workflow right from Slack!'
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*📋 Available Commands:*'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '`/unblock` - Start daily unblock session\n`/wip` - Check current WIP status\n`/stage` - Check project stage gates\n`/idea` - Submit or manage ideas\n`/decision` - Create decision memos\n`/demo` - Sign up for Demo Friday\n`/metrics` - View pod metrics\n`/help <command>` - Get detailed help'
            }
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🎯 Quick Actions:*'
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Check WIP Status'
                },
                action_id: 'quick_wip_check',
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Submit Idea'
                },
                action_id: 'quick_submit_idea'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Metrics'
                },
                action_id: 'quick_view_metrics'
              }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*💡 Tips:*\n• Use commands without parameters to see interactive options\n• Add `public` to share results with the channel\n• Type `/help <command>` for detailed help on specific commands\n• Access your personal dashboard anytime in the Home tab'
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '_CLOS Bot v2.0 | Need more help? Contact #clos-support_'
              }
            ]
          }
        ];

        await respond({
          text: 'CLOS Bot Help',
          blocks,
          response_type: 'ephemeral'
        });

      } else if (topic === 'unblock') {
        await respond({
          text: `🚫 *Unblock Command Help*

*Usage:* \`/unblock\`

*What it does:*
• Shows all your blocked projects
• Provides interface to resolve blockers
• Tracks blocker resolution progress
• Logs unblock activities

*Features:*
• Interactive blocker management
• Add new blockers as discovered
• Remove resolved blockers
• Request help from team members

*Tips:*
• Run daily to stay on top of blockers
• Be specific when describing blockers
• Tag team members who can help resolve issues
• Use during daily standups`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'wip') {
        await respond({
          text: `📊 *WIP Command Help*

*Usage:* 
• \`/wip\` - Your pod's WIP status
• \`/wip <pod-name>\` - Specific pod's WIP status
• \`/wip public\` - Share WIP status with channel

*What it shows:*
• Current WIP vs WIP limit
• Utilization percentage with visual progress bar
• List of active projects
• Recommendations based on WIP level

*WIP Status Levels:*
🟢 Healthy (< 80% utilization)
🟡 High (80-99% utilization)
🔴 At Limit (100% utilization)

*Tips:*
• Monitor daily to prevent overcommitment
• Focus on completing work before starting new projects
• Use recommendations to optimize workflow`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'stage') {
        await respond({
          text: `🎯 *Stage Command Help*

*Usage:*
• \`/stage\` - View your projects and stage gates
• \`/stage advance <project>\` - Request stage advancement

*Stage Gate Process:*
💡 Idea → 🔧 Prototype → 🚀 MVP → 📈 Scale → 🌅 Sunset

*Features:*
• Check stage gate requirements
• Request advancement with justification
• Track approval status
• View requirement checklists

*Stage Gate Requirements:*
Each stage has specific criteria that must be met before advancement, such as user testing, market validation, technical milestones, etc.

*Tips:*
• Complete all requirements before requesting advancement
• Provide detailed justification for advancement requests
• Gather stakeholder input before major stage transitions`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'idea') {
        await respond({
          text: `💡 *Idea Command Help*

*Usage:*
• \`/idea\` - Submit new idea
• \`/idea list\` - View your ideas
• \`/idea list <status>\` - Filter by status (submitted, approved, etc.)
• \`/idea team\` - View team ideas publicly

*Idea Lifecycle:*
📝 Submitted → 👀 Reviewing → ✅ Approved → 🚧 In Progress

*When submitting ideas:*
• Provide clear, descriptive title
• Explain the problem and solution
• Estimate impact (1-5) and effort (1-5)
• System automatically calculates priority

*Priority Calculation:*
Priority = Impact / Effort
• Critical: 3.0+
• High: 2.0-2.9
• Medium: 1.0-1.9
• Low: <1.0

*Tips:*
• Focus on user value and business impact
• Be realistic about effort estimates
• Submit early and iterate based on feedback`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'decision') {
        await respond({
          text: `📋 *Decision Command Help*

*Usage:*
• \`/decision\` - Create new decision memo
• \`/decision list\` - View your decisions
• \`/decision team\` - View team decisions

*Decision Process:*
📝 Draft → 👀 Review → ✅ Approved → 🚀 Implemented

*Decision Memo Components:*
• Context & background
• Options considered
• Recommendation with rationale
• Stakeholder list
• Decision deadline (optional)

*Best Practices:*
• Document significant decisions for future reference
• Include key stakeholders in the review process
• Provide clear rationale for recommendations
• Set appropriate deadlines for time-sensitive decisions

*Tips:*
• Write memos before making important decisions
• Use structured thinking: context → options → recommendation
• Review past decisions to improve future decision-making`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'demo') {
        await respond({
          text: `🎯 *Demo Command Help*

*Usage:*
• \`/demo\` - Sign up for demo slot
• \`/demo list\` - View demo schedule
• \`/demo cancel\` - Cancel your signup

*Demo Friday Guidelines:*
• 5-10 minute presentations
• Show working software, not slides
• Focus on user value and impact
• Include Q&A time
• Test your demo beforehand

*Preparation Tips:*
• Start with the problem you're solving
• Show the solution in action
• Highlight key features and benefits
• Share metrics or user feedback
• End with next steps

*Logistics:*
• Demos are recorded for reference
• Arrive 5 minutes early
• You can invite stakeholders
• Cancel at least 24h in advance if needed

*Questions?*
Contact demo coordinators or ask in #demos channel.`,
          response_type: 'ephemeral'
        });

      } else if (topic === 'metrics') {
        await respond({
          text: `📊 *Metrics Command Help*

*Usage:*
• \`/metrics\` - Your pod metrics
• \`/metrics <pod-name>\` - Specific pod metrics
• \`/metrics overall\` - Company-wide metrics
• \`/metrics personal\` - Your personal metrics

*Key Metrics Tracked:*
• WIP Utilization: How full your pipeline is
• Throughput: Items completed per week
• Cycle Time: Average time to complete items
• Blocker Count: Number of active blockers
• Idea Submission Rate: Innovation activity
• Decision Velocity: Decision-making speed

*Health Score:*
System calculates overall health (0-100) based on:
• WIP management
• Delivery speed
• Cycle efficiency
• Innovation rate

*Performance Indicators:*
🟢 Excellent/Good performance
🟡 Moderate/Needs attention  
🔴 Poor/Action required

*Tips:*
• Review metrics weekly to identify trends
• Use recommendations to improve performance
• Compare with other pods to benchmark`,
          response_type: 'ephemeral'
        });

      } else {
        await respond({
          text: `❓ *Unknown help topic: "${topic}"*

Available help topics:
• \`/help unblock\` - Daily unblock sessions
• \`/help wip\` - WIP status monitoring
• \`/help stage\` - Stage gate management
• \`/help idea\` - Idea submission and tracking
• \`/help decision\` - Decision memo creation
• \`/help demo\` - Demo Friday signups
• \`/help metrics\` - Metrics and analytics

Use \`/help\` without parameters for general help.`,
          response_type: 'ephemeral'
        });
      }

    } catch (error) {
      logger.error('Help command error:', error);
      await respond({
        text: '❌ Failed to show help. Please try again or contact support.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle quick action buttons from general help
  app.action('quick_wip_check', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      // Trigger WIP check (would reuse WIP command logic)
      await client.chat.postMessage({
        channel: userId,
        text: '🔄 Checking your WIP status...\n\nUse `/wip` command for full interactive WIP management.'
      });
    } catch (error) {
      logger.error('Quick WIP check error:', error);
    }
  });

  app.action('quick_submit_idea', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      // Trigger idea submission (would reuse idea command logic)
      await client.chat.postMessage({
        channel: userId,
        text: '💡 Ready to submit an idea!\n\nUse `/idea` command to open the idea submission form.'
      });
    } catch (error) {
      logger.error('Quick submit idea error:', error);
    }
  });

  app.action('quick_view_metrics', async ({ ack, body, client }) => {
    await ack();
    
    try {
      const userId = (body as any).user.id;
      // Trigger metrics view (would reuse metrics command logic)
      await client.chat.postMessage({
        channel: userId,
        text: '📊 Loading your metrics...\n\nUse `/metrics` command for full interactive metrics dashboard.'
      });
    } catch (error) {
      logger.error('Quick view metrics error:', error);
    }
  });
}