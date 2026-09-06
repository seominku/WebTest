import { Injectable } from '@nestjs/common';
import { RedisService } from '../infrastructure/redis.service.js';
import { hmacRequestValue, sha256 } from './auth-security.js';
import type { RateLimitPolicy } from './rate-limit.decorator.js';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async consume(
    policy: RateLimitPolicy,
    subject: string,
  ): Promise<RateLimitDecision | null> {
    const normalizedSubject = subject.trim().toLowerCase() || 'unknown';
    const fingerprint =
      hmacRequestValue(`${policy.subject}:${normalizedSubject}`) ??
      sha256(`${policy.subject}:${normalizedSubject}`);
    const environment = process.env.APP_ENV ?? 'local';
    const key = `rate-limit:${environment}:${policy.scope}:${fingerprint}`;
    const result = await this.redis.incrementFixedWindow(
      key,
      policy.windowSeconds,
    );

    if (!result) return null;

    return {
      allowed: result.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - result.count),
      retryAfterSeconds: result.ttlSeconds,
    };
  }
}
