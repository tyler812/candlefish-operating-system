import { Request, Response, NextFunction } from 'express';
import { depthLimit } from 'graphql-depth-limit';
import { createComplexityLimitRule } from 'graphql-query-complexity';
import { logger } from '../utils/logger';

// GraphQL query validation middleware
export function validationMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip validation for non-GraphQL requests
  if (!req.body?.query) {
    return next();
  }

  try {
    // Basic query size limit
    const queryString = req.body.query;
    const maxQuerySize = parseInt(process.env.MAX_QUERY_SIZE || '10000', 10);
    
    if (queryString.length > maxQuerySize) {
      return res.status(413).json({
        error: {
          code: 'QUERY_TOO_LARGE',
          message: `Query exceeds maximum size of ${maxQuerySize} characters`,
        },
      });
    }

    // Check for potentially dangerous operations in production
    if (process.env.NODE_ENV === 'production') {
      const dangerousOperations = [
        '__schema',
        '__type',
        'introspectionQuery',
      ];
      
      const hasDangerousOp = dangerousOperations.some(op => 
        queryString.includes(op)
      );
      
      if (hasDangerousOp && !req.user) {
        return res.status(403).json({
          error: {
            code: 'INTROSPECTION_DISABLED',
            message: 'Introspection is disabled in production',
          },
        });
      }
    }

    // Rate limiting for mutations
    if (queryString.includes('mutation')) {
      const mutationCount = (queryString.match(/mutation/g) || []).length;
      const maxMutations = 5;
      
      if (mutationCount > maxMutations) {
        return res.status(429).json({
          error: {
            code: 'TOO_MANY_MUTATIONS',
            message: `Maximum ${maxMutations} mutations allowed per request`,
          },
        });
      }
    }

    // Log complex queries for monitoring
    if (queryString.length > 1000) {
      logger.warn('Large GraphQL query detected', {
        querySize: queryString.length,
        userId: req.user?.id,
        requestId: req.requestId,
      });
    }

    next();
  } catch (error) {
    logger.error('Query validation error:', error);
    res.status(400).json({
      error: {
        code: 'INVALID_QUERY',
        message: 'Query validation failed',
      },
    });
  }
}

// GraphQL validation rules for Apollo Server
export const validationRules = [
  // Limit query depth to prevent deep nesting attacks
  depthLimit(10),
  
  // Limit query complexity
  createComplexityLimitRule(1000, {
    maximumComplexity: 1000,
    variables: {},
    onComplete: (complexity: number) => {
      if (complexity > 500) {
        logger.warn('High complexity query executed', { complexity });
      }
    },
  }),
];

// Input sanitization helpers
export function sanitizeString(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

// Input validation middleware factory
export function validateInput<T>(schema: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      
      req.body = validated;
      next();
    } catch (error: any) {
      const validationErrors = error.errors || [error.message];
      
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: validationErrors,
        },
      });
    }
  };
}