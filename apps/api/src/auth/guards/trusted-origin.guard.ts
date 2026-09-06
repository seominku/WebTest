import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const allowedOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    const fetchSite = request.header('sec-fetch-site');
    const origin = request.header('origin');
    const referer = request.header('referer');

    if (fetchSite === 'cross-site') {
      throw new ForbiddenException('Cross-site request rejected');
    }

    if (origin && origin !== allowedOrigin) {
      throw new ForbiddenException('Untrusted origin');
    }

    if (!origin && referer) {
      try {
        if (new URL(referer).origin !== allowedOrigin) {
          throw new ForbiddenException('Untrusted origin');
        }
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        throw new ForbiddenException('Invalid referer');
      }
    }

    return true;
  }
}
