import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@real-estate/db';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { loadLocalEnvironment } from '../src/config/environment.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/infrastructure/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis.service.js';

describe('Authentication flow (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let testUserId: string | undefined;
  const testIp = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;

  beforeAll(async () => {
    loadLocalEnvironment();
    process.env.APP_ENV = 'test';
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.WEB_ORIGIN = 'http://localhost:3000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  it('increments a fixed rate-limit window atomically in Redis', async () => {
    const key = `integration:rate-limit:${randomUUID()}`;

    try {
      const results = await Promise.all(
        Array.from({ length: 10 }, () => redis.incrementFixedWindow(key, 30)),
      );
      const counts = results
        .map((result) => result?.count)
        .sort((left, right) => Number(left) - Number(right));

      expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(results.every((result) => (result?.ttlSeconds ?? 0) > 0)).toBe(
        true,
      );
    } finally {
      await redis.delete(key);
    }
  });

  it('registers, authenticates, verifies CSRF, and revokes a session', async () => {
    const agent = request.agent(app.getHttpServer());
    const email = `codex-auth-${randomUUID()}@example.test`;
    const password = 'StrongPassword123!';
    const origin = 'http://localhost:3000';

    const registration = await agent
      .post('/api/v1/auth/register')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email, password, displayName: '인증 통합 테스트' })
      .expect(201);
    testUserId = registration.body.user.id;
    expect(registration.body.user.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(registration.body.verificationToken).toEqual(expect.any(String));

    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email, password })
      .expect(401);

    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ token: registration.body.verificationToken })
      .expect(200)
      .expect(({ body }) => expect(body.user.status).toBe(UserStatus.ACTIVE));

    await agent
      .post('/api/v1/auth/verify-email')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ token: registration.body.verificationToken })
      .expect(400);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await agent
        .post('/api/v1/auth/login')
        .set('Origin', origin)
        .set('X-Forwarded-For', testIp)
        .send({ email, password: 'DefinitelyWrong123!' })
        .expect(401);
    }

    const lockedUser = await prisma.client.user.findUniqueOrThrow({
      where: { id: testUserId },
    });
    expect(lockedUser.failedLoginCount).toBe(5);
    expect(lockedUser.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email, password })
      .expect(401);

    await prisma.client.user.update({
      where: { id: testUserId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const login = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email, password })
      .expect(200);
    expect(login.body.user.email).toBe(email);
    expect(login.body.csrfToken).toEqual(expect.any(String));
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');

    await agent
      .get('/api/v1/auth/me')
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe(email));

    const rotatedCsrf = await agent
      .get('/api/v1/auth/csrf')
      .expect(200)
      .then(({ body }) => body.csrfToken as string);

    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({})
      .expect(403);

    await agent
      .post('/api/v1/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', rotatedCsrf)
      .send({})
      .expect(200);

    await agent.get('/api/v1/auth/me').expect(401);

    const revokedSessions = await prisma.client.session.count({
      where: { userId: testUserId, revokedAt: { not: null } },
    });
    expect(revokedSessions).toBe(1);
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.client.auditLog.deleteMany({
        where: { actorId: testUserId },
      });
      await prisma.client.user.deleteMany({ where: { id: testUserId } });
    }
    await app.close();
  });
});
