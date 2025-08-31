import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create users
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'patrick@candlefish.ai' },
      update: {},
      create: {
        email: 'patrick@candlefish.ai',
        name: 'Patrick Smith',
        role: 'admin',
        pod: 'INTEGRATOR',
        isActive: true,
      },
    }),
    prisma.user.upsert({
      where: { email: 'demo@candlefish.ai' },
      update: {},
      create: {
        email: 'demo@candlefish.ai',
        name: 'Demo User',
        role: 'user',
        pod: 'PLATFORM',
        isActive: true,
      },
    }),
    ...Array.from({ length: 10 }, (_, i) =>
      prisma.user.upsert({
        where: { email: `user${i}@candlefish.ai` },
        update: {},
        create: {
          email: `user${i}@candlefish.ai`,
          name: faker.person.fullName(),
          role: faker.helpers.arrayElement(['user', 'admin']),
          pod: faker.helpers.arrayElement(['CROWN_TROPHY', 'PAINTBOX', 'PROMOTER_OS', 'RATIO', 'PLATFORM']),
          isActive: true,
        },
      })
    ),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // Create ideas
  const ideas = await Promise.all([
    prisma.idea.upsert({
      where: { id: 'demo-idea-1' },
      update: {},
      create: {
        id: 'demo-idea-1',
        title: 'CLOS Core API Implementation',
        problemStatement: 'We need a centralized API to manage our CLOS workflow and stage gates.',
        hypothesis: 'A GraphQL API with real-time updates will improve portfolio visibility and velocity.',
        impact: 'HIGH',
        effort: 'MONTHS',
        strategicFit: 'CRITICAL',
        score: 12, // (4 * 5) / 4
        confidence: 'HIGH',
        gate: 'SCAFFOLD',
        pod: 'PLATFORM',
        ownerId: users[0].id,
        tags: ['api', 'graphql', 'infrastructure'],
        customerRequest: false,
        revenueImpact: 0,
        nextReview: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        killCriteria: 'If we cannot achieve < 200ms response times',
      },
    }),
    prisma.idea.upsert({
      where: { id: 'demo-idea-2' },
      update: {},
      create: {
        id: 'demo-idea-2',
        title: 'Mobile App for CLOS',
        problemStatement: 'Team members need access to CLOS on mobile devices.',
        hypothesis: 'A native mobile app will increase engagement and idea velocity.',
        impact: 'MEDIUM',
        effort: 'WEEKS',
        strategicFit: 'CORE',
        score: 4, // (3 * 4) / 3
        confidence: 'MEDIUM',
        gate: 'SEED',
        pod: 'CROWN_TROPHY',
        ownerId: users[1].id,
        tags: ['mobile', 'react-native', 'user-experience'],
        customerRequest: true,
        revenueImpact: 50000,
        nextReview: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        killCriteria: 'If adoption is less than 50% after 3 months',
      },
    }),
    ...Array.from({ length: 20 }, (_, i) =>
      prisma.idea.create({
        data: {
          title: faker.company.catchPhrase(),
          problemStatement: faker.lorem.paragraph(),
          hypothesis: faker.lorem.paragraph(),
          impact: faker.helpers.arrayElement(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'TRANSFORMATIVE']),
          effort: faker.helpers.arrayElement(['HOURS', 'DAYS', 'WEEKS', 'MONTHS', 'QUARTERS']),
          strategicFit: faker.helpers.arrayElement(['MISALIGNED', 'TANGENTIAL', 'ALIGNED', 'CORE', 'CRITICAL']),
          score: faker.number.float({ min: 0.5, max: 25, precision: 0.1 }),
          confidence: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH']),
          gate: faker.helpers.arrayElement(['SPARK', 'SEED', 'SCAFFOLD', 'SHIP', 'SCALE', 'PARKED']),
          pod: faker.helpers.arrayElement(['CROWN_TROPHY', 'PAINTBOX', 'PROMOTER_OS', 'RATIO', 'PLATFORM']),
          ownerId: faker.helpers.arrayElement(users).id,
          tags: faker.helpers.arrayElements(['ai', 'automation', 'infrastructure', 'ui', 'performance', 'security'], 3),
          customerRequest: faker.datatype.boolean(),
          revenueImpact: faker.datatype.boolean() ? faker.number.int({ min: 1000, max: 1000000 }) : null,
          nextReview: faker.date.future(),
          killCriteria: faker.lorem.sentence(),
        },
      })
    ),
  ]);

  console.log(`✅ Created ${ideas.length} ideas`);

  // Create activities
  const activities = await Promise.all(
    ideas.flatMap(idea =>
      Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
        prisma.activity.create({
          data: {
            type: faker.helpers.arrayElement(['CREATED', 'UPDATED', 'GATE_CHANGED', 'REVIEWED', 'COMMENTED']),
            description: faker.lorem.sentence(),
            ideaId: idea.id,
            userId: faker.helpers.arrayElement(users).id,
            metadata: {
              source: 'seed',
              timestamp: faker.date.past(),
            },
          },
        })
      )
    )
  );

  console.log(`✅ Created ${activities.length} activities`);

  // Create reviews
  const reviews = await Promise.all(
    ideas.slice(0, 10).map(idea =>
      prisma.review.create({
        data: {
          gate: idea.gate,
          status: faker.helpers.arrayElement(['pending', 'approved', 'rejected']),
          comments: faker.lorem.paragraph(),
          artifactsValid: faker.datatype.boolean(),
          criteriaMetMap: {
            feasibility: faker.datatype.boolean(),
            impact_validated: faker.datatype.boolean(),
            dependencies_mapped: faker.datatype.boolean(),
          },
          ideaId: idea.id,
          reviewerId: faker.helpers.arrayElement(users).id,
        },
      })
    )
  );

  console.log(`✅ Created ${reviews.length} reviews`);

  // Create decision memos
  const decisionMemos = await Promise.all(
    ideas.slice(0, 5).map(idea =>
      prisma.decisionMemo.create({
        data: {
          title: `Decision Memo for ${idea.title}`,
          context: faker.lorem.paragraphs(2),
          threePaths: faker.lorem.paragraphs(3),
          recommendation: faker.lorem.paragraph(),
          reversibility: faker.lorem.paragraph(),
          successMetrics: faker.lorem.paragraph(),
          status: faker.helpers.arrayElement(['draft', 'voting', 'approved', 'rejected']),
          ideaId: idea.id,
          authorId: faker.helpers.arrayElement(users).id,
        },
      })
    )
  );

  console.log(`✅ Created ${decisionMemos.length} decision memos`);

  // Create WIP limits
  const wipLimits = await Promise.all([
    // Per-pod limits
    ...['CROWN_TROPHY', 'PAINTBOX', 'PROMOTER_OS', 'RATIO', 'PLATFORM'].flatMap(pod =>
      ['SPARK', 'SEED', 'SCAFFOLD', 'SHIP', 'SCALE'].map(gate =>
        prisma.wipLimit.upsert({
          where: {
            type_gate_pod: {
              type: 'per_pod',
              gate: gate as any,
              pod: pod as any,
            },
          },
          update: {},
          create: {
            type: 'per_pod',
            gate: gate as any,
            pod: pod as any,
            limit: faker.number.int({ min: 2, max: 10 }),
            current: faker.number.int({ min: 0, max: 5 }),
          },
        })
      )
    ),
    // Cross-pod limits
    ...['SPARK', 'SEED', 'SCAFFOLD', 'SHIP', 'SCALE'].map(gate =>
      prisma.wipLimit.upsert({
        where: {
          type_gate_pod: {
            type: 'cross_pod',
            gate: gate as any,
            pod: null,
          },
        },
        update: {},
        create: {
          type: 'cross_pod',
          gate: gate as any,
          limit: faker.number.int({ min: 10, max: 50 }),
          current: faker.number.int({ min: 0, max: 25 }),
        },
      })
    ),
    // Portfolio limit
    prisma.wipLimit.upsert({
      where: {
        type_gate_pod: {
          type: 'portfolio',
          gate: null,
          pod: null,
        },
      },
      update: {},
      create: {
        type: 'portfolio',
        limit: 100,
        current: ideas.length,
      },
    }),
  ]);

  console.log(`✅ Created ${wipLimits.length} WIP limits`);

  // Create notifications
  const notifications = await Promise.all(
    users.slice(0, 5).flatMap(user =>
      Array.from({ length: faker.number.int({ min: 2, max: 8 }) }, () =>
        prisma.notification.create({
          data: {
            type: faker.helpers.arrayElement(['GATE_PROMOTION', 'GATE_REJECTION', 'WIP_LIMIT_EXCEEDED', 'REVIEW_DUE']),
            title: faker.lorem.sentence({ min: 3, max: 6 }),
            message: faker.lorem.sentence(),
            isRead: faker.datatype.boolean({ probability: 0.7 }),
            userId: user.id,
            ideaId: faker.helpers.maybe(() => faker.helpers.arrayElement(ideas).id, { probability: 0.8 }),
            metadata: {
              source: 'seed',
              priority: faker.helpers.arrayElement(['low', 'medium', 'high']),
            },
          },
        })
      )
    )
  );

  console.log(`✅ Created ${notifications.length} notifications`);

  // Create system metrics
  await prisma.systemMetrics.upsert({
    where: { singleton: true },
    update: {},
    create: {
      singleton: true,
      totalIdeas: ideas.length,
      activeIdeas: ideas.filter(i => !['KILLED', 'PARKED'].includes(i.gate)).length,
      gateDistribution: {
        SPARK: ideas.filter(i => i.gate === 'SPARK').length,
        SEED: ideas.filter(i => i.gate === 'SEED').length,
        SCAFFOLD: ideas.filter(i => i.gate === 'SCAFFOLD').length,
        SHIP: ideas.filter(i => i.gate === 'SHIP').length,
        SCALE: ideas.filter(i => i.gate === 'SCALE').length,
      },
      velocity: 2.5,
      qualityTrend: [85, 87, 89, 88, 90, 92, 89],
      wipUtilization: 65.5,
    },
  });

  console.log('✅ Created system metrics');

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });