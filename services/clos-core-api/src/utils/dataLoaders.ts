import DataLoader from 'dataloader';
import { PrismaClient, User, Idea, Activity, Review, DecisionMemo, WipLimit } from '@prisma/client';

export interface DataLoaders {
  userById: DataLoader<string, User | null>;
  ideaById: DataLoader<string, Idea | null>;
  activitiesByIdeaId: DataLoader<string, Activity[]>;
  reviewsByIdeaId: DataLoader<string, Review[]>;
  decisionMemoByIdeaId: DataLoader<string, DecisionMemo | null>;
  wipLimitsByType: DataLoader<string, WipLimit[]>;
  usersByIds: DataLoader<string[], User[]>;
}

export function createDataLoaders(prisma: PrismaClient): DataLoaders {
  return {
    // User by ID
    userById: new DataLoader(async (ids: readonly string[]) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
      });
      
      const userMap = new Map(users.map(user => [user.id, user]));
      return ids.map(id => userMap.get(id) || null);
    }),

    // Idea by ID
    ideaById: new DataLoader(async (ids: readonly string[]) => {
      const ideas = await prisma.idea.findMany({
        where: { id: { in: [...ids] } },
        include: {
          owner: true,
          assignees: true,
        },
      });
      
      const ideaMap = new Map(ideas.map(idea => [idea.id, idea]));
      return ids.map(id => ideaMap.get(id) || null);
    }),

    // Activities by Idea ID
    activitiesByIdeaId: new DataLoader(async (ideaIds: readonly string[]) => {
      const activities = await prisma.activity.findMany({
        where: { ideaId: { in: [...ideaIds] } },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      });
      
      const activitiesMap = new Map<string, Activity[]>();
      activities.forEach(activity => {
        const list = activitiesMap.get(activity.ideaId) || [];
        list.push(activity);
        activitiesMap.set(activity.ideaId, list);
      });
      
      return ideaIds.map(id => activitiesMap.get(id) || []);
    }),

    // Reviews by Idea ID
    reviewsByIdeaId: new DataLoader(async (ideaIds: readonly string[]) => {
      const reviews = await prisma.review.findMany({
        where: { ideaId: { in: [...ideaIds] } },
        include: { reviewer: true },
        orderBy: { createdAt: 'desc' },
      });
      
      const reviewsMap = new Map<string, Review[]>();
      reviews.forEach(review => {
        const list = reviewsMap.get(review.ideaId) || [];
        list.push(review);
        reviewsMap.set(review.ideaId, list);
      });
      
      return ideaIds.map(id => reviewsMap.get(id) || []);
    }),

    // Decision Memo by Idea ID
    decisionMemoByIdeaId: new DataLoader(async (ideaIds: readonly string[]) => {
      const memos = await prisma.decisionMemo.findMany({
        where: { ideaId: { in: [...ideaIds] } },
        include: {
          author: true,
          votes: { include: { user: true } },
        },
      });
      
      const memoMap = new Map(memos.map(memo => [memo.ideaId, memo]));
      return ideaIds.map(id => memoMap.get(id) || null);
    }),

    // WIP Limits by Type
    wipLimitsByType: new DataLoader(async (types: readonly string[]) => {
      const wipLimits = await prisma.wipLimit.findMany({
        where: { type: { in: [...types] } },
        include: { ideas: true },
      });
      
      const wipLimitsMap = new Map<string, WipLimit[]>();
      wipLimits.forEach(wipLimit => {
        const list = wipLimitsMap.get(wipLimit.type) || [];
        list.push(wipLimit);
        wipLimitsMap.set(wipLimit.type, list);
      });
      
      return types.map(type => wipLimitsMap.get(type) || []);
    }),

    // Multiple users by IDs
    usersByIds: new DataLoader(async (idArrays: readonly string[][]) => {
      // Flatten all IDs to fetch in one query
      const allIds = [...new Set(idArrays.flat())];
      const users = await prisma.user.findMany({
        where: { id: { in: allIds } },
      });
      
      const userMap = new Map(users.map(user => [user.id, user]));
      
      // Return arrays of users for each input array
      return idArrays.map(ids => 
        ids.map(id => userMap.get(id)).filter(Boolean) as User[]
      );
    }),
  };
}