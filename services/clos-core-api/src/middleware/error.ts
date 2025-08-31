import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
}

// Custom error classes
export class ValidationError extends Error implements ApiError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error implements ApiError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';
  
  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements ApiError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';
  
  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';
  
  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;
  code = 'CONFLICT';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class BusinessLogicError extends Error implements ApiError {
  statusCode = 422;
  code = 'BUSINESS_LOGIC_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

export class ExternalServiceError extends Error implements ApiError {
  statusCode = 502;
  code = 'EXTERNAL_SERVICE_ERROR';
  
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ExternalServiceError';
  }
}

export class RateLimitError extends Error implements ApiError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Error middleware
export function errorMiddleware(
  error: ApiError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  const errorLogger = logger.child({
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  errorLogger.error('Request error:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    details: (error as ApiError).details,
  });

  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  // Determine status code and error response
  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  if (error as ApiError) {
    const apiError = error as ApiError;
    statusCode = apiError.statusCode || 500;
    code = apiError.code || 'INTERNAL_SERVER_ERROR';
    message = apiError.message;
    details = apiError.details;
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    
    switch (prismaError.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'A record with this data already exists';
        details = { field: prismaError.meta?.target };
        break;
        
      case 'P2025': // Record not found
        statusCode = 404;
        code = 'NOT_FOUND';
        message = 'Record not found';
        break;
        
      case 'P2003': // Foreign key constraint violation
        statusCode = 422;
        code = 'FOREIGN_KEY_CONSTRAINT';
        message = 'Referenced record does not exist';
        break;
        
      default:
        statusCode = 500;
        code = 'DATABASE_ERROR';
        message = 'Database operation failed';
    }
  }

  // Handle GraphQL errors
  if (error.name === 'GraphQLError') {
    const graphqlError = error as any;
    statusCode = 400;
    code = 'GRAPHQL_ERROR';
    message = graphqlError.message;
    details = {
      locations: graphqlError.locations,
      path: graphqlError.path,
      extensions: graphqlError.extensions,
    };
  }

  // Sanitize error message in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
    details = undefined;
  }

  // Send error response
  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        requestId: req.requestId,
      }),
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
  });
}

// Async error handler wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}