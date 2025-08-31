import { App } from '@slack/bolt';
import express from 'express';
import cron from 'node-cron';
import config from './utils/config';
import logger from './utils/logger';
import redis from './utils/redis';

// Import command handlers
import { registerUnblockCommand } from './commands/unblock';
import { registerWipCommand } from './commands/wip';
import { registerStageCommand } from './commands/stage';
import { registerIdeaCommand } from './commands/idea';
import { registerDecisionCommand } from './commands/decision';
import { registerDemoCommand } from './commands/demo';
import { registerMetricsCommand } from './commands/metrics';
import { registerHelpCommand } from './commands/help';

// Import event handlers
import { registerStageGateEvents } from './events/stageGates';
import { registerWipEvents } from './events/wipMonitoring';
import { registerGitHubEvents } from './events/github';
import { registerCalendarEvents } from './events/calendar';

// Import interactive handlers
import { registerModalHandlers } from './interactions/modals';
import { registerButtonHandlers } from './interactions/buttons';
import { registerHomeTabHandler } from './interactions/homeTab';

// Import scheduled tasks
import { registerDailyReminders } from './services/reminders';
import { registerNotificationHandlers } from './services/notifications';

class CLOSSlackBot {
  private app: App;
  private expressApp: express.Application;

  constructor() {
    // Initialize Slack Bolt app
    this.app = new App({
      token: config.SLACK_BOT_TOKEN,
      signingSecret: config.SLACK_SIGNING_SECRET,
      appToken: config.SLACK_APP_TOKEN,
      socketMode: true,
      port: config.PORT,
      logLevel: config.LOG_LEVEL as any,
    });

    // Initialize Express app for webhooks
    this.expressApp = express();
    this.expressApp.use(express.json());

    this.setupMiddleware();
    this.registerCommands();
    this.registerEvents();
    this.registerInteractions();
    this.setupWebhooks();
    this.setupScheduledTasks();
  }

  private setupMiddleware(): void {
    // Global error handler
    this.app.error((error) => {
      logger.error('Slack app error:', error);
    });

    // Logging middleware
    this.app.use(async ({ next, context, body }) => {
      logger.info(`Received event: ${body.type || 'unknown'}`, {
        userId: context.userId,
        channelId: context.channelId,
        teamId: context.teamId,
      });
      await next();
    });

    // Rate limiting middleware
    this.app.use(async ({ next, context }) => {
      const userId = context.userId;
      if (userId) {
        const key = `rate_limit:${userId}`;
        const current = await redis.get(key);
        
        if (current && parseInt(current) > 50) { // 50 requests per minute
          logger.warn(`Rate limit exceeded for user ${userId}`);
          return;
        }
        
        await redis.set(key, (parseInt(current || '0') + 1).toString(), 60);
      }
      await next();
    });
  }

  private registerCommands(): void {
    logger.info('Registering Slack commands...');
    
    registerUnblockCommand(this.app);
    registerWipCommand(this.app);
    registerStageCommand(this.app);
    registerIdeaCommand(this.app);
    registerDecisionCommand(this.app);
    registerDemoCommand(this.app);
    registerMetricsCommand(this.app);
    registerHelpCommand(this.app);
    
    logger.info('All commands registered successfully');
  }

  private registerEvents(): void {
    logger.info('Registering event handlers...');
    
    registerStageGateEvents(this.app);
    registerWipEvents(this.app);
    registerGitHubEvents(this.app);
    registerCalendarEvents(this.app);
    
    logger.info('All event handlers registered successfully');
  }

  private registerInteractions(): void {
    logger.info('Registering interactive handlers...');
    
    registerModalHandlers(this.app);
    registerButtonHandlers(this.app);
    registerHomeTabHandler(this.app);
    
    logger.info('All interactive handlers registered successfully');
  }

  private setupWebhooks(): void {
    // GitHub webhooks
    this.expressApp.post('/webhook/github', (req, res) => {
      logger.info('Received GitHub webhook:', req.headers['x-github-event']);
      // Handle GitHub webhook
      res.status(200).send('OK');
    });

    // CLOS API webhooks
    this.expressApp.post('/webhook/clos', (req, res) => {
      logger.info('Received CLOS webhook:', req.body.event);
      // Handle CLOS webhook
      res.status(200).send('OK');
    });

    // Health check
    this.expressApp.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        redis: redis.isConnected(),
      });
    });
  }

  private setupScheduledTasks(): void {
    logger.info('Setting up scheduled tasks...');
    
    // Daily standup reminder at 9 AM
    cron.schedule('0 9 * * 1-5', () => {
      registerDailyReminders(this.app);
    }, {
      timezone: 'America/New_York'
    });

    // Weekly metrics report on Friday at 4 PM
    cron.schedule('0 16 * * 5', () => {
      registerNotificationHandlers(this.app, 'weekly');
    }, {
      timezone: 'America/New_York'
    });

    // Monthly review reminder on last Friday at 3 PM
    cron.schedule('0 15 * * 5#4', () => {
      registerNotificationHandlers(this.app, 'monthly');
    }, {
      timezone: 'America/New_York'
    });

    logger.info('Scheduled tasks configured');
  }

  async start(): Promise<void> {
    try {
      // Connect to Redis
      await redis.connect();
      logger.info('Connected to Redis');

      // Start Slack app
      await this.app.start();
      logger.info(`⚡️ CLOS Slack Bot is running on port ${config.PORT}`);

      // Start Express server for webhooks
      this.expressApp.listen(config.PORT + 1, () => {
        logger.info(`🔗 Webhook server is running on port ${config.PORT + 1}`);
      });

    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    try {
      await this.app.stop();
      await redis.disconnect();
      logger.info('CLOS Slack Bot stopped');
    } catch (error) {
      logger.error('Error stopping bot:', error);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

// Initialize and start the bot
const bot = new CLOSSlackBot();

if (require.main === module) {
  bot.start().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  });
}

export default bot;