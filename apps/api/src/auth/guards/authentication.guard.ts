import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { readSessionCookie } from '../auth-cookie.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { SessionService } from '../session.service.js';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request.headers.cookie);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    request.auth = await this.sessions.authenticate(token);
    return true;
  }
}
