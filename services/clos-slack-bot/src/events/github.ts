import { App } from '@slack/bolt';
import closApi from '../services/closApi';
import logger from '../utils/logger';
import { formatDate } from '../utils/helpers';

export function registerGitHubEvents(app: App): void {
  
  // Handle GitHub webhook events
  async function handleGitHubWebhook(client: any, payload: any): Promise<void> {
    try {
      const { event, data } = payload;

      switch (event) {
        case 'pull_request':
          await handlePullRequestEvent(client, data);
          break;
        case 'push':
          await handlePushEvent(client, data);
          break;
        case 'issues':
          await handleIssueEvent(client, data);
          break;
        case 'release':
          await handleReleaseEvent(client, data);
          break;
        case 'workflow_run':
          await handleWorkflowEvent(client, data);
          break;
        default:
          logger.info(`Unhandled GitHub event: ${event}`);
      }

    } catch (error) {
      logger.error('GitHub webhook handler error:', error);
    }
  }

  // Handle Pull Request events
  async function handlePullRequestEvent(client: any, data: any): Promise<void> {
    try {
      const { action, pull_request, repository } = data;
      
      if (!pull_request || !repository) return;

      const prTitle = pull_request.title;
      const prUrl = pull_request.html_url;
      const author = pull_request.user.login;
      const repoName = repository.name;
      
      // Try to extract project reference from PR title or description
      const projectMatch = prTitle.match(/\[([^\]]+)\]/) || pull_request.body?.match(/Project:\s*([^\n]+)/i);
      const projectName = projectMatch?.[1]?.trim();

      switch (action) {
        case 'opened':
          await handlePROpened(client, { prTitle, prUrl, author, repoName, projectName });
          break;
        case 'ready_for_review':
          await handlePRReadyForReview(client, { prTitle, prUrl, author, repoName, projectName });
          break;
        case 'closed':
          if (pull_request.merged) {
            await handlePRMerged(client, { prTitle, prUrl, author, repoName, projectName });
          }
          break;
        case 'review_requested':
          await handlePRReviewRequested(client, { prTitle, prUrl, author, repoName, reviewers: data.requested_reviewers });
          break;
      }

    } catch (error) {
      logger.error('Pull Request event handler error:', error);
    }
  }

  async function handlePROpened(client: any, prData: any): Promise<void> {
    const { prTitle, prUrl, author, repoName, projectName } = prData;
    
    // Post to development channel
    const devChannel = '#development'; // Configure this
    try {
      await client.chat.postMessage({
        channel: devChannel,
        text: `🔀 *New Pull Request*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🔀 *New Pull Request Opened*\n\n*Repository:* ${repoName}\n*Author:* ${author}\n*Title:* <${prUrl}|${prTitle}>${projectName ? `\n*Project:* ${projectName}` : ''}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Review PR'
                },
                url: prUrl,
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View Repository'
                },
                url: `https://github.com/${repoName}`
              }
            ]
          }
        ]
      });
    } catch (channelError) {
      logger.warn('Failed to post PR opened notification:', channelError);
    }

    // If linked to a project, update project activity
    if (projectName) {
      try {
        const projects = await closApi.getProjects();
        const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
        
        if (project) {
          await closApi.logActivity({
            userId: 'github',
            action: 'pr_opened',
            target: project.id,
            metadata: { prTitle, prUrl, author, repoName }
          });
        }
      } catch (projectError) {
        logger.warn('Failed to link PR to project:', projectError);
      }
    }
  }

  async function handlePRReadyForReview(client: any, prData: any): Promise<void> {
    const { prTitle, prUrl, author, repoName } = prData;
    
    // Post to development channel with review request
    const devChannel = '#development';
    try {
      await client.chat.postMessage({
        channel: devChannel,
        text: `👀 *Pull Request Ready for Review*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👀 *PR Ready for Review*\n\n*Repository:* ${repoName}\n*Author:* ${author}\n*Title:* <${prUrl}|${prTitle}>\n\n*Need reviewers!* Please review if you have capacity.`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Review Now'
                },
                url: prUrl,
                style: 'primary'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Report Blocker'
                },
                action_id: 'report_pr_blocker',
                value: JSON.stringify({ prUrl, prTitle, author })
              }
            ]
          }
        ]
      });
    } catch (channelError) {
      logger.warn('Failed to post PR ready notification:', channelError);
    }
  }

  async function handlePRMerged(client: any, prData: any): Promise<void> {
    const { prTitle, prUrl, author, repoName, projectName } = prData;
    
    // Post success notification
    const devChannel = '#development';
    try {
      await client.chat.postMessage({
        channel: devChannel,
        text: `✅ *Pull Request Merged*\n\n*Repository:* ${repoName}\n*Author:* ${author}\n*Title:* <${prUrl}|${prTitle}>${projectName ? `\n*Project:* ${projectName}` : ''}\n\n🎉 Great work!`
      });
    } catch (channelError) {
      logger.warn('Failed to post PR merged notification:', channelError);
    }

    // Update project progress if linked
    if (projectName) {
      try {
        const projects = await closApi.getProjects();
        const project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
        
        if (project) {
          await closApi.logActivity({
            userId: 'github',
            action: 'pr_merged',
            target: project.id,
            metadata: { prTitle, prUrl, author, repoName }
          });
        }
      } catch (projectError) {
        logger.warn('Failed to update project progress:', projectError);
      }
    }
  }

  async function handlePRReviewRequested(client: any, prData: any): Promise<void> {
    const { prTitle, prUrl, author, repoName, reviewers } = prData;
    
    // Send DMs to requested reviewers
    for (const reviewer of reviewers || []) {
      try {
        const reviewerSlackId = await getSlackIdFromGitHub(reviewer.login);
        if (reviewerSlackId) {
          await client.chat.postMessage({
            channel: reviewerSlackId,
            text: `👀 *Review Requested*`,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `👀 *You've been requested to review a PR*\n\n*Repository:* ${repoName}\n*Author:* ${author}\n*Title:* <${prUrl}|${prTitle}>`
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Review Now'
                    },
                    url: prUrl,
                    style: 'primary'
                  },
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Can\'t Review'
                    },
                    action_id: 'decline_pr_review',
                    value: JSON.stringify({ prUrl, prTitle, author })
                  }
                ]
              }
            ]
          });
        }
      } catch (reviewerError) {
        logger.warn(`Failed to notify reviewer ${reviewer.login}:`, reviewerError);
      }
    }
  }

  // Handle other GitHub events
  async function handlePushEvent(client: any, data: any): Promise<void> {
    // Handle significant pushes (to main branch, with many commits, etc.)
    const { commits, repository, pusher, ref } = data;
    
    if (ref === 'refs/heads/main' && commits?.length > 5) {
      const devChannel = '#development';
      try {
        await client.chat.postMessage({
          channel: devChannel,
          text: `🚀 *Large Push to Main Branch*\n\n*Repository:* ${repository.name}\n*Pusher:* ${pusher.name}\n*Commits:* ${commits.length}\n\nConsider creating a release or deployment.`
        });
      } catch (channelError) {
        logger.warn('Failed to post push notification:', channelError);
      }
    }
  }

  async function handleIssueEvent(client: any, data: any): Promise<void> {
    const { action, issue, repository } = data;
    
    if (action === 'opened' && issue.labels?.some((label: any) => label.name === 'bug')) {
      // Handle critical bug reports
      const devChannel = '#development';
      try {
        await client.chat.postMessage({
          channel: devChannel,
          text: `🐛 *New Bug Report*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🐛 *New Bug Reported*\n\n*Repository:* ${repository.name}\n*Title:* <${issue.html_url}|${issue.title}>\n*Reporter:* ${issue.user.login}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Investigate'
                  },
                  url: issue.html_url,
                  style: 'danger'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Create Blocker'
                  },
                  action_id: 'create_issue_blocker',
                  value: JSON.stringify({ issueUrl: issue.html_url, issueTitle: issue.title })
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to post issue notification:', channelError);
      }
    }
  }

  async function handleReleaseEvent(client: any, data: any): Promise<void> {
    const { action, release, repository } = data;
    
    if (action === 'published') {
      const announcementChannel = '#announcements';
      try {
        await client.chat.postMessage({
          channel: announcementChannel,
          text: `🎉 *New Release Published*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎉 *New Release: ${release.tag_name}*\n\n*Repository:* ${repository.name}\n*Name:* ${release.name}\n*Published by:* ${release.author.login}\n\n<${release.html_url}|View Release Notes>`
              }
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to post release notification:', channelError);
      }
    }
  }

  async function handleWorkflowEvent(client: any, data: any): Promise<void> {
    const { workflow_run } = data;
    
    if (workflow_run.conclusion === 'failure' && workflow_run.head_branch === 'main') {
      // Notify about failed CI/CD on main branch
      const devChannel = '#development';
      try {
        await client.chat.postMessage({
          channel: devChannel,
          text: `❌ *CI/CD Failure on Main Branch*`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `❌ *Build Failure*\n\n*Repository:* ${workflow_run.repository.name}\n*Workflow:* ${workflow_run.name}\n*Branch:* ${workflow_run.head_branch}\n*Author:* ${workflow_run.head_commit.author.name}`
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Logs'
                  },
                  url: workflow_run.html_url,
                  style: 'danger'
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Create Blocker'
                  },
                  action_id: 'create_ci_blocker',
                  value: JSON.stringify({ 
                    workflowUrl: workflow_run.html_url, 
                    workflowName: workflow_run.name,
                    repository: workflow_run.repository.name
                  })
                }
              ]
            }
          ]
        });
      } catch (channelError) {
        logger.warn('Failed to post workflow failure notification:', channelError);
      }
    }
  }

  // Handle GitHub-related action buttons
  app.action('report_pr_blocker', async ({ ack, body, client }) => {
    await ack();

    try {
      const prData = JSON.parse((body as any).actions[0].value);
      
      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'create_pr_blocker',
          private_metadata: JSON.stringify(prData),
          title: {
            type: 'plain_text',
            text: 'Report PR Blocker'
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚫 *Report Blocker for PR*\n\n*Title:* ${prData.prTitle}\n*Author:* ${prData.author}`
              }
            },
            {
              type: 'input',
              block_id: 'blocker_description',
              element: {
                type: 'plain_text_input',
                action_id: 'description_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Describe what is blocking this PR...'
                },
                multiline: true
              },
              label: {
                type: 'plain_text',
                text: 'Blocker Description'
              }
            },
            {
              type: 'input',
              block_id: 'affected_project',
              element: {
                type: 'plain_text_input',
                action_id: 'project_text',
                placeholder: {
                  type: 'plain_text',
                  text: 'Which project is affected?'
                }
              },
              label: {
                type: 'plain_text',
                text: 'Affected Project'
              },
              optional: true
            }
          ],
          submit: {
            type: 'plain_text',
            text: 'Report Blocker'
          },
          close: {
            type: 'plain_text',
            text: 'Cancel'
          }
        }
      });

    } catch (error) {
      logger.error('Report PR blocker error:', error);
    }
  });

  app.view('create_pr_blocker', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const prData = JSON.parse(view.private_metadata);
      const values = view.state.values;
      
      const description = values.blocker_description.description_text.value;
      const projectName = values.affected_project.project_text.value;
      const userId = body.user.id;

      // Find the project if specified
      let project = null;
      if (projectName) {
        const projects = await closApi.getProjects();
        project = projects.find(p => p.name.toLowerCase().includes(projectName.toLowerCase()));
      }

      if (project) {
        // Add blocker to project
        await closApi.addBlocker(project.id, `PR Review: ${description} (${prData.prUrl})`);
      }

      // Notify development channel
      const devChannel = '#development';
      await client.chat.postMessage({
        channel: devChannel,
        text: `🚫 *PR Blocker Reported*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚫 *PR Blocker Reported*\n\n*PR:* <${prData.prUrl}|${prData.prTitle}>\n*Reported by:* <@${userId}>\n*Description:* ${description}${project ? `\n*Project:* ${project.name}` : ''}`
            }
          }
        ]
      });

      // Send confirmation to reporter
      await client.chat.postMessage({
        channel: userId,
        text: `✅ PR blocker reported successfully. ${project ? 'The blocker has been added to the project.' : 'Consider linking this to a specific project.'}`
      });

    } catch (error) {
      logger.error('Create PR blocker error:', error);
    }
  });

  // Utility functions
  async function getSlackIdFromGitHub(githubUsername: string): Promise<string | null> {
    // This would require a mapping between GitHub usernames and Slack user IDs
    // For now, return null - in production, you'd maintain this mapping
    return null;
  }

  // Export webhook handler for use in main server
  (app as any).githubWebhook = {
    handleGitHubWebhook
  };

  logger.info('GitHub event handlers registered');
}