import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  // Slack Configuration
  SLACK_SIGNING_SECRET: z.string().min(1, 'Slack signing secret is required'),
  SLACK_BOT_TOKEN: z.string().min(1, 'Slack bot token is required'),
  SLACK_APP_TOKEN: z.string().min(1, 'Slack app token is required'),
  
  // CLOS API Configuration
  CLOS_API_URL: z.string().url('Valid CLOS API URL is required'),
  CLOS_API_KEY: z.string().min(1, 'CLOS API key is required'),
  
  // Database Configuration
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // Server Configuration
  PORT: z.string().transform(Number).default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // GitHub Integration
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  
  // Calendar Integration
  GOOGLE_CALENDAR_CREDENTIALS: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

try {
  config = configSchema.parse(process.env);
} catch (error) {
  console.error('Configuration validation failed:', error);
  process.exit(1);
}

export default config;