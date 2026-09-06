import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class MetricsTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const configuredToken = process.env.METRICS_TOKEN;
    const authorization = context
      .switchToHttp()
      .getRequest<Request>()
      .header('authorization');
    const suppliedToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    if (
      !configuredToken ||
      !suppliedToken ||
      !this.matches(configuredToken, suppliedToken)
    ) {
      throw new UnauthorizedException('Valid metrics token required');
    }
    return true;
  }

  private matches(expected: string, supplied: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }
}
