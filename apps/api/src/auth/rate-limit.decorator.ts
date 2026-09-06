import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_POLICIES = Symbol('rate-limit-policies');

export type RateLimitSubject = 'email' | 'ip';

export interface RateLimitPolicy {
  limit: number;
  scope: string;
  subject: RateLimitSubject;
  windowSeconds: number;
}

export const RateLimits = (...policies: RateLimitPolicy[]) =>
  SetMetadata(RATE_LIMIT_POLICIES, policies);
