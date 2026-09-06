import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { matchesSha256 } from '../auth-security.js';
import type { AuthenticatedRequest } from '../auth.types.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.header('x-csrf-token');

    if (!token || !matchesSha256(token, request.auth.csrfSecretHash)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
