import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// Extend Express Request to include request ID
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate unique request ID
  req.requestId = uuidv4();
  req.startTime = Date.now();

  // Create child logger with request context
  const requestLogger = logger.child({
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress,
  });

  // Log incoming request
  requestLogger.info('Incoming request', {
    body: req.method === 'POST' ? sanitizeBody(req.body) : undefined,
    query: req.query,
    params: req.params,
  });

  // Override res.json to log responses
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - (req.startTime || 0);
    
    requestLogger.info('Outgoing response', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: JSON.stringify(body).length,
    });

    // Log errors separately
    if (res.statusCode >= 400) {
      requestLogger.error('Request failed', {
        statusCode: res.statusCode,
        error: body,
        duration: `${duration}ms`,
      });
    }

    return originalJson.call(this, body);
  };

  // Handle response finish event
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || 0);
    
    requestLogger.info('Request completed', {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length'),
    });
  });

  next();
}

// Sanitize request body to remove sensitive information
function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') {
    return body;
  }

  const sensitiveFields = ['password', 'token', 'authorization', 'auth', 'secret', 'key'];
  const sanitized = { ...body };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Recursively sanitize nested objects
  for (const [key, value] of Object.entries(sanitized)) {
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeBody(value);
    }
  }

  return sanitized;
}