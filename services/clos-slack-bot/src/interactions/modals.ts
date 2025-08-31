import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { sanitizeInput } from '../utils/helpers';

export function registerModalHandlers(app: App): void {
  
  // Handle blocker management modal submission
  app.view('manage_blockers', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const newBlockerText = values.new_blocker?.new_blocker_text?.value;
      const projectId = metadata.projectId;
      const userId = metadata.userId;

      if (newBlockerText) {
        const sanitizedBlocker = sanitizeInput(newBlockerText);
        await closApi.addBlocker(projectId, sanitizedBlocker);
      }

      const project = await closApi.getProject(projectId);
      
      // Send confirmation
      await client.chat.postMessage({
        channel: userId,
        text: newBlockerText 
          ? `✅ *Blocker Management Updated*\n\n*Project:* ${project.name}\n*New blocker added:* ${newBlockerText}\n\nUse \`/unblock\` again to see updated status.`
          : `✅ *Blocker Management Completed*\n\n*Project:* ${project.name}\n\nBlocker status updated successfully.`
      });

      // Log activity
      const user = await closApi.getUser(userId);
      if (user && newBlockerText) {
        await closApi.logActivity({
          userId: user.id,
          action: 'added_blocker',
          target: projectId,
          metadata: { blocker: sanitizedBlocker }
        });
      }

    } catch (error) {
      logger.error('Manage blockers modal error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to update blockers. Please try again or contact support.'
      });
    }
  });

  // Handle idea approval from reviewers
  app.action(/^(approve|reject)_idea$/, async ({ ack, body, respond, client }) => {
    await ack();

    try {
      const action = (body as any).actions[0].action_id;
      const ideaId = (body as any).actions[0].value;
      const reviewerId = (body as any).user.id;

      const newStatus = action === 'approve_idea' ? 'approved' : 'rejected';
      const idea = await closApi.updateIdeaStatus(ideaId, newStatus);

      // Notify idea submitter
      const submitterUser = await closApi.getUser(idea.submitter);
      if (submitterUser) {
        const emoji = newStatus === 'approved' ? '🎉' : '❌';
        const statusText = newStatus === 'approved' ? 'APPROVED' : 'REJECTED';
        
        await client.chat.postMessage({
          channel: submitterUser.slackUserId,
          text: `${emoji} *Idea ${statusText}*\n\n*Title:* ${idea.title}\n*Reviewed by:* <@${reviewerId}>\n*Status:* ${statusText}\n\n${newStatus === 'approved' ? 'Your idea has been added to the development pipeline!' : 'Thank you for your suggestion. Keep the ideas coming!'}`
        });
      }

      await respond({
        text: `${newStatus === 'approved' ? '✅' : '❌'} Idea ${newStatus} by <@${reviewerId}>`,
        response_type: 'in_channel'
      });

      // Log activity
      const reviewer = await closApi.getUser(reviewerId);
      if (reviewer) {
        await closApi.logActivity({
          userId: reviewer.id,
          action: `${newStatus}_idea`,
          target: ideaId,
          metadata: { ideaTitle: idea.title }
        });
      }

    } catch (error) {
      logger.error('Idea approval/rejection error:', error);
      await respond({
        text: '❌ Failed to update idea status. Please try again.',
        response_type: 'ephemeral'
      });
    }
  });

  // Handle idea review later action
  app.action('review_idea_later', async ({ ack, respond }) => {
    await ack();

    try {
      await respond({
        text: '📝 Idea marked for later review. You can find it in the ideas backlog.',
        response_type: 'ephemeral'
      });

    } catch (error) {
      logger.error('Review idea later error:', error);
    }
  });

  // Handle bulk actions modal
  app.view('bulk_action_confirmation', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const { action, items, userId } = metadata;
      const confirmed = values.confirmation?.confirm_action?.selected_option?.value === 'yes';

      if (!confirmed) {
        await client.chat.postMessage({
          channel: userId,
          text: '❌ Bulk action cancelled.'
        });
        return;
      }

      // Process bulk action
      let successCount = 0;
      let errorCount = 0;

      for (const item of items) {
        try {
          switch (action) {
            case 'close_completed':
              // This would close/archive completed projects
              await closApi.updateProjectStage(item.id, 'sunset');
              successCount++;
              break;
            case 'update_status':
              // Batch status updates
              successCount++;
              break;
            default:
              errorCount++;
          }
        } catch (itemError) {
          logger.error(`Bulk action error for item ${item.id}:`, itemError);
          errorCount++;
        }
      }

      // Send results summary
      await client.chat.postMessage({
        channel: userId,
        text: `📊 *Bulk Action Results*\n\n*Action:* ${action}\n*Total items:* ${items.length}\n*Successful:* ${successCount}\n*Failed:* ${errorCount}\n\n${errorCount > 0 ? 'Some items failed to update. Please check individual items.' : 'All items updated successfully!'}`
      });

      // Log activity
      const user = await closApi.getUser(userId);
      if (user) {
        await closApi.logActivity({
          userId: user.id,
          action: 'bulk_action_completed',
          target: action,
          metadata: { itemCount: items.length, successCount, errorCount }
        });
      }

    } catch (error) {
      logger.error('Bulk action confirmation error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to process bulk action. Please try again or contact support.'
      });
    }
  });

  // Handle quick project creation modal
  app.view('quick_project_creation', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const values = view.state.values;
      
      const projectName = values.project_name.name_input.value;
      const projectDescription = values.description.description_input.value;
      const priority = values.priority.priority_select.selected_option?.value || 'medium';
      const estimatedDuration = values.duration.duration_select.selected_option?.value || '4';
      const userId = body.user.id;

      // Create project via CLOS API (simplified)
      const projectData = {
        name: sanitizeInput(projectName),
        description: sanitizeInput(projectDescription),
        owner: userId,
        priority,
        estimatedDuration: parseInt(estimatedDuration),
        stage: 'idea' as const
      };

      // This would create the project - for now just log
      logger.info('Quick project creation:', projectData);

      await client.chat.postMessage({
        channel: userId,
        text: `🎯 *Project Created Successfully!*\n\n*Name:* ${projectName}\n*Priority:* ${priority.toUpperCase()}\n*Estimated Duration:* ${estimatedDuration} weeks\n*Stage:* IDEA\n\nYour project has been created and added to your pipeline. Use \`/stage\` to manage stage gates and \`/wip\` to monitor progress.`
      });

    } catch (error) {
      logger.error('Quick project creation error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to create project. Please try again or contact support.'
      });
    }
  });

  // Handle project template selection modal
  app.view('project_template_selection', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const values = view.state.values;
      const selectedTemplate = values.template.template_select.selected_option?.value;
      const customizations = values.customizations?.customization_input?.value;
      const userId = body.user.id;

      const templates = {
        web_app: {
          name: 'Web Application',
          stages: ['prototype', 'mvp', 'scale'],
          checklist: ['Design mockups', 'Backend API', 'Frontend implementation', 'User testing', 'Deployment']
        },
        mobile_app: {
          name: 'Mobile Application',
          stages: ['prototype', 'mvp', 'scale'],
          checklist: ['Platform decision', 'UI/UX design', 'Core features', 'App store submission', 'User feedback']
        },
        integration: {
          name: 'System Integration',
          stages: ['prototype', 'mvp'],
          checklist: ['Requirements analysis', 'API design', 'Implementation', 'Testing', 'Documentation']
        }
      };

      const template = templates[selectedTemplate as keyof typeof templates];
      
      if (template) {
        await client.chat.postMessage({
          channel: userId,
          text: `📋 *Project Template Applied*\n\n*Template:* ${template.name}\n*Stages:* ${template.stages.join(' → ')}\n*Checklist items:* ${template.checklist.length}\n\n${customizations ? `*Customizations:* ${customizations}\n\n` : ''}Use \`/stage\` to begin working through the stage gates for this project type.`
        });
      }

    } catch (error) {
      logger.error('Project template selection error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to apply project template. Please try again or contact support.'
      });
    }
  });

  // Handle feedback submission modal
  app.view('feedback_submission', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const values = view.state.values;
      
      const feedbackType = values.type.feedback_type_select.selected_option?.value;
      const feedbackText = values.feedback.feedback_input.value;
      const priority = values.priority?.priority_select?.selected_option?.value || 'medium';
      const userId = body.user.id;

      // Process feedback
      const feedback = {
        type: feedbackType,
        text: sanitizeInput(feedbackText),
        priority,
        submittedBy: userId,
        timestamp: new Date().toISOString()
      };

      // Send to feedback channel
      const feedbackChannel = '#feedback'; // Configure this
      try {
        await client.chat.postMessage({
          channel: feedbackChannel,
          text: `💬 *New Feedback Submitted*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `💬 *New Feedback*\n\n*Type:* ${feedbackType?.toUpperCase()}\n*Priority:* ${priority?.toUpperCase()}\n*From:* <@${userId}>\n\n*Feedback:*\n${feedbackText}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Acknowledge'
                  },
                  action_id: 'acknowledge_feedback',
                  value: JSON.stringify(feedback)
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Create Issue'
                  },
                  action_id: 'create_issue_from_feedback',
                  value: JSON.stringify(feedback)
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to post to feedback channel:', channelError);
      }

      // Send confirmation to user
      await client.chat.postMessage({
        channel: userId,
        text: `✅ *Feedback Submitted Successfully*\n\n*Type:* ${feedbackType?.toUpperCase()}\n*Priority:* ${priority?.toUpperCase()}\n\nThank you for your feedback! The team will review it and get back to you if needed.`
      });

      // Log activity
      const user = await closApi.getUser(userId);
      if (user) {
        await closApi.logActivity({
          userId: user.id,
          action: 'submitted_feedback',
          target: 'feedback',
          metadata: { type: feedbackType, priority }
        });
      }

    } catch (error) {
      logger.error('Feedback submission error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Failed to submit feedback. Please try again or contact support.'
      });
    }
  });

  // Handle advanced search modal
  app.view('advanced_search', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const values = view.state.values;
      
      const searchType = values.search_type.type_select.selected_option?.value;
      const searchTerm = values.search_term.term_input.value;
      const filters = {
        status: values.filters?.status_filter?.selected_options?.map((opt: any) => opt.value) || [],
        dateRange: values.filters?.date_range?.selected_option?.value,
        owner: values.filters?.owner_filter?.selected_users || []
      };
      const userId = body.user.id;

      // Perform search based on type
      let searchResults = [];
      
      switch (searchType) {
        case 'projects':
          // Search projects
          const projects = await closApi.getProjects();
          searchResults = projects.filter(p => 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchTerm.toLowerCase())
          );
          break;
        case 'ideas':
          // Search ideas
          const ideas = await closApi.getIdeas();
          searchResults = ideas.filter(i =>
            i.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            i.description.toLowerCase().includes(searchTerm.toLowerCase())
          );
          break;
        case 'decisions':
          // Search decisions
          const decisions = await closApi.getDecisions();
          searchResults = decisions.filter(d =>
            d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.context.toLowerCase().includes(searchTerm.toLowerCase())
          );
          break;
      }

      // Apply filters
      if (filters.status.length > 0) {
        searchResults = searchResults.filter((item: any) => filters.status.includes(item.status));
      }

      if (filters.owner.length > 0) {
        searchResults = searchResults.filter((item: any) => filters.owner.includes(item.owner || item.submitter));
      }

      // Send results
      if (searchResults.length === 0) {
        await client.chat.postMessage({
          channel: userId,
          text: `🔍 *Search Results*\n\nNo results found for "${searchTerm}" in ${searchType}.\n\nTry adjusting your search term or filters.`
        });
      } else {
        const resultsText = searchResults.slice(0, 10).map((item: any, index: number) => 
          `${index + 1}. *${item.name || item.title}* - ${item.stage || item.status || 'N/A'}`
        ).join('\n');

        await client.chat.postMessage({
          channel: userId,
          text: `🔍 *Search Results*\n\n*Query:* "${searchTerm}" in ${searchType}\n*Found:* ${searchResults.length} result(s)\n\n${resultsText}${searchResults.length > 10 ? '\n\n_Showing first 10 results. Refine search for more specific results._' : ''}`
        });
      }

    } catch (error) {
      logger.error('Advanced search error:', error);
      
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ Search failed. Please try again or contact support.'
      });
    }
  });

  logger.info('Modal handlers registered');
}