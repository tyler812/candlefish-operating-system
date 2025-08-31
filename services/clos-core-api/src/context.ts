import { Request, Response } from 'express';
import { PrismaClient, User } from '@prisma/client';
import DataLoader from 'dataloader';

import { prisma } from './utils/database';
import { logger } from './utils/logger';
import { EventPublisher } from './events/publisher';
import { WebSocketManager } from './websocket/manager';
import { createDataLoaders, DataLoaders } from './utils/dataLoaders';

export interface Context {
  req: Request;
  res: Response;
  prisma: PrismaClient;
  user?: User;
  dataloaders: DataLoaders;
  eventPublisher: EventPublisher;
  wsManager: WebSocketManager;
  logger: typeof logger;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  // Get user from auth middleware (if authenticated)
  const user = (req as any).user;
  
  // Create data loaders for this request
  const dataloaders = createDataLoaders(prisma);
  
  // Get shared instances
  const eventPublisher = EventPublisher.getInstance();
  const wsManager = WebSocketManager.getInstance();

  return {
    req,
    res,
    prisma,
    user,
    dataloaders,
    eventPublisher,
    wsManager,
    logger,
  };
}