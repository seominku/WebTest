import type { UserRole } from '@real-estate/db';
import type { Request } from 'express';

export interface AuthenticatedPrincipal {
  sessionId: string;
  tokenHash: string;
  csrfSecretHash: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
  };
}

export interface AuthenticatedRequest extends Request {
  auth: AuthenticatedPrincipal;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}
