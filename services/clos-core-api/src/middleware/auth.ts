import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-client';
import { prisma } from '../utils/database';
import { authLogger as logger } from '../utils/logger';

interface AuthUser {
  id: string;
  email: string;
  name: string;
  sub: string;
  iat: number;
  exp: number;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser & { dbUser?: any };
    }
  }
}

// JWKS client for Auth0
const client = jwksClient({
  jwksUri: process.env.AUTH0_JWKS_URI || 'https://candlefish.auth0.com/.well-known/jwks.json',
  requestHeaders: {}, // Optional
  timeout: 30000, // Defaults to 30s
  cache: true, // Caches the JWKS data
  cacheMaxEntries: 5, // Maximum number of cached JWKS
  cacheMaxAge: 600000, // Cache TTL in milliseconds
});

// Get signing key from JWKS
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      logger.error('Error getting signing key:', err);
      return callback(err);
    }
    
    const signingKey = key?.getPublicKey() || (key as any)?.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Verify JWT token
function verifyToken(token: string): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_AUDIENCE || 'https://api.candlefish.ai',
      issuer: process.env.AUTH0_ISSUER || 'https://candlefish.auth0.com/',
      algorithms: ['RS256'],
    }, (err, decoded) => {
      if (err) {
        logger.error('JWT verification failed:', err);
        return reject(err);
      }
      
      if (!decoded || typeof decoded === 'string') {
        return reject(new Error('Invalid token payload'));
      }
      
      resolve(decoded as AuthUser);
    });
  });
}

// Get or create user in database
async function getOrCreateUser(authUser: AuthUser) {
  try {
    // First try to find existing user
    let user = await prisma.user.findUnique({
      where: { email: authUser.email },
    });

    if (!user) {
      // Create new user if doesn't exist
      user = await prisma.user.create({
        data: {
          email: authUser.email,
          name: authUser.name || authUser.email,
          role: 'user', // Default role
          isActive: true,
        },
      });
      
      logger.info('Created new user:', { id: user.id, email: user.email });
    } else if (!user.isActive) {
      // Reactivate user if they were deactivated
      user = await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true },
      });
      
      logger.info('Reactivated user:', { id: user.id, email: user.email });
    }

    return user;
  } catch (error) {
    logger.error('Error getting/creating user:', error);
    throw error;
  }
}

// Authentication middleware
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Skip auth for health checks and introspection in development
    const skipAuth = ['/health', '/ready', '/metrics'].includes(req.path) ||
      (process.env.NODE_ENV === 'development' && req.method === 'POST' && req.body?.query?.includes('__schema'));

    if (skipAuth) {
      return next();
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Allow public queries in development
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_ANONYMOUS === 'true') {
        return next();
      }
      
      return res.status(401).json({
        error: 'Authorization header missing or invalid',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the JWT token
    const authUser = await verifyToken(token);
    
    // Get or create user in database
    const dbUser = await getOrCreateUser(authUser);
    
    // Attach user to request
    req.user = {
      ...authUser,
      dbUser,
    };
    
    logger.debug('User authenticated:', { 
      id: dbUser.id, 
      email: dbUser.email,
      sub: authUser.sub,
    });
    
    next();
  } catch (error) {
    logger.error('Authentication failed:', error);
    
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
    
    // Generic auth error
    return res.status(401).json({
      error: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
}

// Optional middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }
  next();
}

// Role-based access control middleware
export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.dbUser) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }
    
    if (!roles.includes(req.user.dbUser.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
    }
    
    next();
  };
}

// Pod access control middleware
export function requirePodAccess(req: Request, res: Response, next: NextFunction) {
  const { user } = req;
  if (!user?.dbUser) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }
  
  // Admin and integrator pod have access to everything
  if (user.dbUser.role === 'admin' || user.dbUser.pod === 'INTEGRATOR') {
    return next();
  }
  
  // TODO: Implement pod-specific access control logic based on the operation
  next();
}