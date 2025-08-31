import { DateResolver, JSONResolver } from 'graphql-scalars';
import { queryResolvers } from './query';
import { mutationResolvers } from './mutation';
import { subscriptionResolvers } from './subscription';
import { ideaResolvers } from './idea';
import { userResolvers } from './user';
import { activityResolvers } from './activity';
import { reviewResolvers } from './review';
import { decisionMemoResolvers } from './decisionMemo';
import { wipLimitResolvers } from './wipLimit';
import { notificationResolvers } from './notification';
import { portfolioMetricsResolvers } from './portfolioMetrics';
import { podHealthResolvers } from './podHealth';

export const resolvers = {
  // Scalar types
  Date: DateResolver,
  JSON: JSONResolver,
  
  // Root types
  Query: queryResolvers,
  Mutation: mutationResolvers,
  Subscription: subscriptionResolvers,
  
  // Object types
  Idea: ideaResolvers,
  User: userResolvers,
  Activity: activityResolvers,
  Review: reviewResolvers,
  DecisionMemo: decisionMemoResolvers,
  WipLimit: wipLimitResolvers,
  Notification: notificationResolvers,
  PortfolioMetrics: portfolioMetricsResolvers,
  PodHealth: podHealthResolvers,
};