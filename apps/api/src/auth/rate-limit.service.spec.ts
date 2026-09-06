import { RedisService } from '../infrastructure/redis.service.js';
import type { RateLimitPolicy } from './rate-limit.decorator.js';
import { RateLimitService } from './rate-limit.service.js';

describe('RateLimitService', () => {
  const policy: RateLimitPolicy = {
    limit: 2,
    scope: 'unit-login-email',
    subject: 'email',
    windowSeconds: 60,
  };

  it('uses a pseudonymous key and rejects counts over the limit', async () => {
    const incrementFixedWindow = vi
      .fn()
      .mockResolvedValueOnce({ count: 1, ttlSeconds: 60 })
      .mockResolvedValueOnce({ count: 3, ttlSeconds: 42 });
    const redis = {
      incrementFixedWindow,
    } as unknown as RedisService;
    const service = new RateLimitService(redis);

    await expect(
      service.consume(policy, 'Person@Example.com'),
    ).resolves.toEqual({
      allowed: true,
      limit: 2,
      remaining: 1,
      retryAfterSeconds: 60,
    });
    await expect(
      service.consume(policy, 'Person@Example.com'),
    ).resolves.toEqual({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    const key = incrementFixedWindow.mock.calls[0]?.[0] as string;
    expect(key).not.toContain('person@example.com');
    expect(key).toContain('rate-limit:');
  });
});
