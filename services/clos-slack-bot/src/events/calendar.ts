import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export function registerCalendarEvents(app: App): void {
  
  // Handle calendar integration events
  async function handleCalendarEvent(client: any, payload: any): Promise<void> {
    try {
      const { event, data } = payload;

      switch (event) {
        case 'meeting_created':
          await handleMeetingCreated(client, data);
          break;
        case 'meeting_updated':
          await handleMeetingUpdated(client, data);
          break;
        case 'meeting_cancelled':
          await handleMeetingCancelled(client, data);
          break;
        case 'meeting_reminder':
          await handleMeetingReminder(client, data);
          break;
        case 'demo_scheduled':
          await handleDemoScheduled(client, data);
          break;
        case 'stage_gate_meeting':
          await handleStageGateMeeting(client, data);
          break;
        default:
          logger.info(`Unhandled calendar event: ${event}`);
      }

    } catch (error) {
      logger.error('Calendar event handler error:', error);
    }
  }

  // Handle meeting creation
  async function handleMeetingCreated(client: any, data: any): Promise<void> {
    try {
      const { meeting, organizer, attendees, type } = data;
      
      // Only handle CLOS-related meetings
      if (!isCLOSMeeting(meeting.title, meeting.description)) return;

      const meetingType = detectMeetingType(meeting.title, meeting.description);
      
      if (meetingType === 'demo') {
        await handleDemoMeetingCreated(client, data);
      } else if (meetingType === 'stage_gate') {
        await handleStageGateMeetingCreated(client, data);
      } else if (meetingType === 'standup') {
        await handleStandupMeetingCreated(client, data);
      }

      // Log activity
      await closApi.logActivity({
        userId: organizer.email,
        action: 'meeting_created',
        target: meeting.id,
        metadata: { 
          title: meeting.title,
          type: meetingType,
          attendeeCount: attendees.length
        }
      });

    } catch (error) {
      logger.error('Meeting created handler error:', error);
    }
  }

  async function handleDemoMeetingCreated(client: any, data: any): Promise<void> {
    const { meeting, organizer, attendees } = data;
    
    // Post to demos channel
    const demosChannel = '#demos';
    try {
      await client.chat.postMessage({
        channel: demosChannel,
        text: `🎯 *Demo Session Scheduled*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *Demo Session Scheduled*\n\n*Title:* ${meeting.title}\n*Date:* ${formatDate(new Date(meeting.startTime))}\n*Organizer:* ${organizer.name}\n*Attendees:* ${attendees.length} people`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Meeting Link:* <${meeting.link}|Join Demo>\n*Calendar:* <${meeting.calendarLink}|Add to Calendar>`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Join Demo'
                },
                url: meeting.link,
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Agenda'
                },
                action_id: 'view_demo_agenda',
                value: meeting.id
              }
            ]
          }
        ]
      });
    } catch (channelError) {
      logger.warn('Failed to post demo meeting notification:', channelError);
    }

    // Send reminders to presenters
    const presenters = extractPresentersFromDescription(meeting.description);
    for (const presenter of presenters) {
      try {
        const slackUser = await getSlackUserFromEmail(presenter.email);
        if (slackUser) {
          await client.chat.postMessage({
            channel: slackUser.id,
            text: `🎯 *Demo Reminder*\n\nYou're scheduled to demo "${presenter.project}" on ${formatDate(new Date(meeting.startTime))}.\n\n*Preparation checklist:*\n• Test your demo beforehand\n• Prepare talking points\n• Have backup plan ready\n• Arrive 5 minutes early\n\n*Demo link:* ${meeting.link}`
          });
        }
      } catch (presenterError) {
        logger.warn(`Failed to notify presenter ${presenter.email}:`, presenterError);
      }
    }
  }

  async function handleStageGateMeetingCreated(client: any, data: any): Promise<void> {
    const { meeting, organizer, attendees } = data;
    
    // Extract project info from meeting details
    const projectInfo = extractProjectFromMeeting(meeting);
    
    // Post to stage gates channel
    const stageGatesChannel = '#stage-gates';
    try {
      await client.chat.postMessage({
        channel: stageGatesChannel,
        text: `🎯 *Stage Gate Review Scheduled*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 *Stage Gate Review Meeting*\n\n*Project:* ${projectInfo?.name || 'TBD'}\n*Date:* ${formatDate(new Date(meeting.startTime))}\n*Organizer:* ${organizer.name}\n*Reviewers:* ${attendees.length} people`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Meeting Link:* <${meeting.link}|Join Review>\n*Calendar:* <${meeting.calendarLink}|Add to Calendar>`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Join Review'
                },
                url: meeting.link,
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Requirements'
                },
                action_id: 'view_stage_requirements',
                value: projectInfo?.id || meeting.id
              }
            ]
          }
        ]
      });
    } catch (channelError) {
      logger.warn('Failed to post stage gate meeting notification:', channelError);
    }
  }

  async function handleStandupMeetingCreated(client: any, data: any): Promise<void> {
    const { meeting, attendees } = data;
    
    // Extract pod info
    const podInfo = extractPodFromMeeting(meeting);
    const podChannel = podInfo ? `#${podInfo.toLowerCase()}-pod` : '#general';
    
    try {
      await client.chat.postMessage({
        channel: podChannel,
        text: `📅 *Daily Standup Scheduled*\n\n*Time:* ${formatDate(new Date(meeting.startTime))}\n*Participants:* ${attendees.length} people\n\n*Pre-standup checklist:*\n• Run \`/unblock\` to check for blockers\n• Review your WIP with \`/wip\`\n• Prepare your updates\n\n*Meeting link:* <${meeting.link}|Join Standup>`
      });
    } catch (channelError) {
      logger.warn('Failed to post standup meeting notification:', channelError);
    }
  }

  // Handle meeting updates
  async function handleMeetingUpdated(client: any, data: any): Promise<void> {
    const { meeting, changes, organizer } = data;
    
    if (!isCLOSMeeting(meeting.title, meeting.description)) return;

    const meetingType = detectMeetingType(meeting.title, meeting.description);
    const targetChannel = getChannelForMeetingType(meetingType);

    // Notify about significant changes
    const significantChanges = ['time', 'date', 'location', 'link'];
    const hasSignificantChange = changes.some((change: any) => significantChanges.includes(change.field));

    if (hasSignificantChange && targetChannel) {
      try {
        await client.chat.postMessage({
          channel: targetChannel,
          text: `⚠️ *Meeting Updated*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⚠️ *Meeting Updated*\n\n*Title:* ${meeting.title}\n*Updated by:* ${organizer.name}\n*Changes:* ${changes.map((c: any) => c.description).join(', ')}\n\n*New details:*\n*Date:* ${formatDate(new Date(meeting.startTime))}\n*Link:* <${meeting.link}|Join Meeting>`
              }
            }
          ]
        });
      } catch (channelError) {
        logger.warn(`Failed to post meeting update to ${targetChannel}:`, channelError);
      }
    }
  }

  // Handle meeting cancellations
  async function handleMeetingCancelled(client: any, data: any): Promise<void> {
    const { meeting, reason, organizer } = data;
    
    if (!isCLOSMeeting(meeting.title, meeting.description)) return;

    const meetingType = detectMeetingType(meeting.title, meeting.description);
    const targetChannel = getChannelForMeetingType(meetingType);

    if (targetChannel) {
      try {
        await client.chat.postMessage({
          channel: targetChannel,
          text: `❌ *Meeting Cancelled*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `❌ *Meeting Cancelled*\n\n*Title:* ${meeting.title}\n*Cancelled by:* ${organizer.name}\n*Original time:* ${formatDate(new Date(meeting.startTime))}${reason ? `\n*Reason:* ${reason}` : ''}`
              }
            }
          ]
        });
      } catch (channelError) {
        logger.warn(`Failed to post cancellation to ${targetChannel}:`, channelError);
      }
    }

    // Handle demo cancellations specifically
    if (meetingType === 'demo') {
      await handleDemoCancellation(client, data);
    }
  }

  async function handleDemoCancellation(client: any, data: any): Promise<void> {
    const { meeting } = data;
    const presenters = extractPresentersFromDescription(meeting.description);

    // Notify presenters
    for (const presenter of presenters) {
      try {
        const slackUser = await getSlackUserFromEmail(presenter.email);
        if (slackUser) {
          await client.chat.postMessage({
            channel: slackUser.id,
            text: `❌ *Demo Cancelled*\n\nYour demo "${presenter.project}" scheduled for ${formatDate(new Date(meeting.startTime))} has been cancelled.\n\nYou can reschedule using \`/demo\` command.`
          });
        }
      } catch (presenterError) {
        logger.warn(`Failed to notify presenter about cancellation:`, presenterError);
      }
    }
  }

  // Handle meeting reminders
  async function handleMeetingReminder(client: any, data: any): Promise<void> {
    const { meeting, reminderType, attendees } = data; // reminderType: '1day', '1hour', '15min'
    
    if (!isCLOSMeeting(meeting.title, meeting.description)) return;

    const meetingType = detectMeetingType(meeting.title, meeting.description);
    
    // Send personalized reminders based on meeting type
    for (const attendee of attendees) {
      try {
        const slackUser = await getSlackUserFromEmail(attendee.email);
        if (slackUser) {
          const reminderMessage = getReminderMessage(meetingType, meeting, reminderType);
          await client.chat.postMessage({
            channel: slackUser.id,
            text: reminderMessage.text,
            blocks: reminderMessage.blocks
          });
        }
      } catch (attendeeError) {
        logger.warn(`Failed to send reminder to ${attendee.email}:`, attendeeError);
      }
    }
  }

  // Handle demo scheduling from calendar
  async function handleDemoScheduled(client: any, data: any): Promise<void> {
    const { demo, presenter, project } = data;
    
    try {
      // Update CLOS system with demo signup
      const user = await closApi.getUser(presenter.slackId);
      if (user && project?.id) {
        await closApi.signUpForDemo(
          user.id,
          demo.date,
          demo.slot,
          project.id
        );
      }

      // Send confirmation
      await client.chat.postMessage({
        channel: presenter.slackId,
        text: `🎯 *Demo Confirmed via Calendar*\n\n*Project:* ${project?.name}\n*Date:* ${formatDate(new Date(demo.startTime))}\n*Duration:* ${demo.duration} minutes\n\nDemo details have been synced with CLOS system.`
      });

    } catch (error) {
      logger.error('Handle demo scheduled error:', error);
    }
  }

  // Utility functions
  function isCLOSMeeting(title: string, description: string): boolean {
    const closKeywords = ['demo', 'stage gate', 'standup', 'retrospective', 'planning', 'clos'];
    const text = (title + ' ' + description).toLowerCase();
    return closKeywords.some(keyword => text.includes(keyword));
  }

  function detectMeetingType(title: string, description: string): string {
    const text = (title + ' ' + description).toLowerCase();
    
    if (text.includes('demo')) return 'demo';
    if (text.includes('stage gate') || text.includes('gate review')) return 'stage_gate';
    if (text.includes('standup') || text.includes('daily sync')) return 'standup';
    if (text.includes('retrospective') || text.includes('retro')) return 'retrospective';
    if (text.includes('planning') || text.includes('sprint planning')) return 'planning';
    
    return 'general';
  }

  function getChannelForMeetingType(meetingType: string): string {
    const channelMap: { [key: string]: string } = {
      'demo': '#demos',
      'stage_gate': '#stage-gates',
      'standup': '#general',
      'retrospective': '#general',
      'planning': '#general',
      'general': '#general'
    };
    
    return channelMap[meetingType] || '#general';
  }

  function extractPresentersFromDescription(description: string): Array<{email: string, project: string}> {
    // Parse description to extract presenter info
    // This is a simplified version - in production, you'd have a more robust parser
    const lines = description.split('\n');
    const presenters = [];
    
    for (const line of lines) {
      const match = line.match(/(.+@.+\..+)\s*-\s*(.+)/);
      if (match) {
        presenters.push({
          email: match[1].trim(),
          project: match[2].trim()
        });
      }
    }
    
    return presenters;
  }

  function extractProjectFromMeeting(meeting: any): {id?: string, name?: string} | null {
    // Extract project information from meeting title or description
    const text = (meeting.title + ' ' + meeting.description).toLowerCase();
    const projectMatch = text.match(/project:\s*([^\n]+)/i);
    
    if (projectMatch) {
      return {
        name: projectMatch[1].trim()
      };
    }
    
    return null;
  }

  function extractPodFromMeeting(meeting: any): string | null {
    const text = (meeting.title + ' ' + meeting.description).toLowerCase();
    const podMatch = text.match(/pod:\s*([^\n]+)/i) || text.match(/(\w+)\s+pod/i);
    
    return podMatch ? podMatch[1].trim() : null;
  }

  function getReminderMessage(meetingType: string, meeting: any, reminderType: string): any {
    const baseMessage = {
      text: `⏰ Meeting reminder: ${meeting.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⏰ *Meeting Reminder*\n\n*Title:* ${meeting.title}\n*Time:* ${formatDate(new Date(meeting.startTime))}\n*Link:* <${meeting.link}|Join Meeting>`
          }
        }
      ]
    };

    // Add type-specific preparation tips
    if (meetingType === 'demo') {
      baseMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Demo checklist:*\n• Test your demo\n• Prepare talking points\n• Join 5 minutes early\n• Have backup plan ready'
        }
      });
    } else if (meetingType === 'standup') {
      baseMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Standup prep:*\n• Check blockers with `/unblock`\n• Review WIP with `/wip`\n• Prepare your updates'
        }
      });
    } else if (meetingType === 'stage_gate') {
      baseMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Stage gate prep:*\n• Review requirements\n• Prepare justification\n• Gather supporting evidence'
        }
      });
    }

    return baseMessage;
  }

  async function getSlackUserFromEmail(email: string): Promise<{id: string} | null> {
    // This would require a mapping between email addresses and Slack user IDs
    // For now, return null - in production, you'd maintain this mapping or use Slack's API
    return null;
  }

  // Export calendar handler for use in main server
  (app as any).calendarWebhook = {
    handleCalendarEvent
  };

  logger.info('Calendar event handlers registered');
}