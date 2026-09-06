import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimits } from '../rate-limit.decorator.js';
import { RateLimitService } from '../rate-limit.service.js';
import { RateLimitGuard } from './rate-limit.guard.js';

class GuardFixtureController {
  @RateLimits({
    limit: 2,
    scope: 'unit-login-email',
    subject: 'email',
    windowSeconds: 60,
  })
  login(): void {}
}

describe('RateLimitGuard', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each(['staging', 'production'])(
    'fails closed with Korean 503 in %s when Redis is unavailable',
    async (environment) => {
      vi.stubEnv('APP_ENV', environment);
      const setHeader = vi.fn();
      const guard = new RateLimitGuard(new Reflector(), {
        consume: vi.fn().mockResolvedValue(null),
      } as unknown as RateLimitService);
      const context = {
        getHandler: () => GuardFixtureController.prototype.login,
        getClass: () => GuardFixtureController,
        switchToHttp: () => ({
          getRequest: () => ({
            body: { email: 'drill@example.test' },
            socket: {},
          }),
          getResponse: () => ({ setHeader }),
        }),
      } as unknown as ExecutionContext;
      const error = (await guard
        .canActivate(context)
        .catch((reason) => reason)) as HttpException;
      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toEqual(
        expect.objectContaining({
          code: 'REQUEST_PROTECTION_UNAVAILABLE',
          message: expect.stringContaining('잠시 후'),
        }),
      );
      expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    },
  );
  it.each(['local', 'test'])(
    'keeps the existing development fallback in %s',
    async (environment) => {
      vi.stubEnv('APP_ENV', environment);
      const guard = new RateLimitGuard(new Reflector(), {
        consume: vi.fn().mockResolvedValue(null),
      } as unknown as RateLimitService);
      const context = {
        getHandler: () => GuardFixtureController.prototype.login,
        getClass: () => GuardFixtureController,
        switchToHttp: () => ({
          getRequest: () => ({ body: {}, socket: {} }),
          getResponse: () => ({ setHeader: vi.fn() }),
        }),
      } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
  it('returns 429 and Retry-After when a policy is exhausted', async () => {
    const setHeader = vi.fn();
    const consume = vi.fn().mockResolvedValue({
      allowed: false,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 37,
    });
    const guard = new RateLimitGuard(new Reflector(), {
      consume,
    } as unknown as RateLimitService);
    const context = {
      getHandler: () => GuardFixtureController.prototype.login,
      getClass: () => GuardFixtureController,
      switchToHttp: () => ({
        getRequest: () => ({
          body: { email: ' Person@Example.com ' },
          ip: '127.0.0.1',
          socket: {},
        }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    const error = await guard.canActivate(context).catch((reason) => reason);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'email' }),
      ' Person@Example.com ',
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '37');
  });
});
