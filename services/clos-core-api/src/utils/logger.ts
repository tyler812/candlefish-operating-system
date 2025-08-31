import pino from 'pino';

const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Create logger instance
export const logger = pino({
  level: LOG_LEVEL,
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Pretty print in development
  ...(NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),

  // Production structured logging
  ...(NODE_ENV === 'production' && {
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: ['req.headers.authorization', 'password', 'token'],
      censor: '[REDACTED]',
    },
  }),

  // Base fields for all log entries
  base: {
    service: 'clos-core-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: NODE_ENV,
  },
});

// Create child loggers for different modules
export const createModuleLogger = (module: string) => {
  return logger.child({ module });
};

// Export specific loggers
export const dbLogger = createModuleLogger('database');
export const authLogger = createModuleLogger('auth');
export const wsLogger = createModuleLogger('websocket');
export const eventLogger = createModuleLogger('events');
export const stageGateLogger = createModuleLogger('stage-gates');
export const wipLogger = createModuleLogger('wip-limits');