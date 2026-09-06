import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  it('/api/v1/health/live (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'api',
          status: 'ok',
          version: '0.0.1',
        });
        expect(body.timestamp).toEqual(expect.any(String));
      });
  });

  it('/api/v1/health/ready returns 503 without dependencies', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(503)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          service: 'api',
          status: 'unavailable',
          checks: [
            { name: 'postgres', status: 'not-configured' },
            { name: 'redis', status: 'not-configured' },
            { name: 'object-storage', status: 'not-configured' },
            { name: 'malware-scanner', status: 'not-configured' },
          ],
        });
      });
  });

  it('/api/v1/health/metrics requires an admin session', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health/metrics')
      .expect(401);
  });

  it('/api/v1/health/metrics/prometheus accepts a metrics bearer token', async () => {
    const token = 'test-metrics-token-at-least-32-characters';
    process.env.METRICS_TOKEN = token;
    try {
      await request(app.getHttpServer())
        .get('/api/v1/health/metrics/prometheus')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect('Content-Type', /text\/plain/)
        .expect(({ text }) => {
          expect(text).toContain('real_estate_image_orphan_cleanup_running 0');
          expect(text).toContain(
            'real_estate_image_orphan_cleanup_last_error 0',
          );
        });
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });

  it('/api/v1/health/metrics/prometheus rejects an invalid token', async () => {
    process.env.METRICS_TOKEN = 'test-metrics-token-at-least-32-characters';
    try {
      await request(app.getHttpServer())
        .get('/api/v1/health/metrics/prometheus')
        .set('Authorization', 'Bearer wrong-token')
        .expect(401);
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });

  it('/api/v1/auth/register rejects a short password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'person@example.com',
        password: 'too-short',
        displayName: '테스트 사용자',
      })
      .expect(400);
  });

  it('/api/v1/auth/login rejects non-JSON requests', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .type('form')
      .send({ email: 'person@example.com', password: 'not-a-real-password' })
      .expect(415);
  });

  it('/api/v1/auth/login rejects an untrusted origin', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'person@example.com', password: 'not-a-real-password' })
      .expect(403);
  });

  it('/api/v1/auth/me requires a session cookie', () => {
    return request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('/api/v1/listings rejects an invalid property type', () => {
    return request(app.getHttpServer())
      .get('/api/v1/listings?propertyType=INVALID')
      .expect(400);
  });

  it('/api/v1/listings/:id requires a UUID', () => {
    return request(app.getHttpServer())
      .get('/api/v1/listings/not-a-uuid')
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
