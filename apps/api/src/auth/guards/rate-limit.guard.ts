import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  RATE_LIMIT_POLICIES,
  type RateLimitPolicy,
} from '../rate-limit.decorator.js';
import { RateLimitService } from '../rate-limit.service.js';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policies = this.reflector.getAllAndOverride<RateLimitPolicy[]>(
      RATE_LIMIT_POLICIES,
      [context.getHandler(), context.getClass()],
    );
    if (!policies?.length) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    for (const policy of policies) {
      const decision = await this.rateLimits.consume(
        policy,
        this.subjectFor(request, policy),
      );

      if (!decision) {
        const environment = process.env.APP_ENV ?? 'local';
        if (environment === 'local' || environment === 'test') continue;
        response.setHeader('Retry-After', '3');
        response.setHeader('Cache-Control', 'no-store');
        throw new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'REQUEST_PROTECTION_UNAVAILABLE',
          message:
            '로그인 등 요청을 보호하는 서비스가 일시적으로 중단되었습니다. 잠시 후 다시 시도해 주세요.',
        });
      }

      if (!decision.allowed) {
        response.setHeader('Retry-After', String(decision.retryAfterSeconds));
        throw new HttpException(
          {
            error: 'Too Many Requests',
            message: 'Too many requests. Try again later.',
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }

  private subjectFor(request: Request, policy: RateLimitPolicy): string {
    if (policy.subject === 'email') {
      const body = request.body as { email?: unknown } | undefined;
      return typeof body?.email === 'string' ? body.email : 'missing';
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
