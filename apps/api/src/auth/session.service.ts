import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole, UserStatus, type User } from '@real-estate/db';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { RedisService } from '../infrastructure/redis.service.js';
import { hmacRequestValue, sha256 } from './auth-security.js';
import type { AuthenticatedPrincipal, RequestContext } from './auth.types.js';

const USER_IDLE_TTL_MS = 30 * 60 * 1_000;
const USER_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1_000;
const ADMIN_IDLE_TTL_MS = 15 * 60 * 1_000;
const ADMIN_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1_000;
const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1_000;
const CACHE_TTL_SECONDS = 60;

interface CachedSession extends AuthenticatedPrincipal {
  expiresAt: string;
  idleExpiresAt: string;
}

export interface CreatedSession {
  token: string;
  csrfToken: string;
  expiresAt: Date;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(user: User, context: RequestContext): Promise<CreatedSession> {
    const now = new Date();
    const isAdmin = user.role === UserRole.ADMIN;
    const absoluteTtl = isAdmin ? ADMIN_ABSOLUTE_TTL_MS : USER_ABSOLUTE_TTL_MS;
    const idleTtl = isAdmin ? ADMIN_IDLE_TTL_MS : USER_IDLE_TTL_MS;
    const expiresAt = new Date(now.getTime() + absoluteTtl);
    const idleExpiresAt = new Date(now.getTime() + idleTtl);
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const tokenHash = sha256(token);
    const csrfSecretHash = sha256(csrfToken);
    const ipHash = hmacRequestValue(context.ip);

    const session = await this.prisma.client.$transaction(
      async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lastLoginAt: now,
            lockedUntil: null,
          },
        });
        const created = await transaction.session.create({
          data: {
            userId: user.id,
            tokenHash,
            csrfSecretHash,
            ipHash,
            userAgentHash: hmacRequestValue(context.userAgent),
            expiresAt,
            idleExpiresAt,
          },
        });
        await transaction.auditLog.create({
          data: {
            actorId: user.id,
            action: 'auth.login.succeeded',
            resourceType: 'session',
            resourceId: created.id,
            ipHash,
          },
        });
        return created;
      },
    );

    await this.cache({
      sessionId: session.id,
      tokenHash,
      csrfSecretHash,
      expiresAt: expiresAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
      user: this.publicUser(user),
    });

    return { token, csrfToken, expiresAt };
  }

  async authenticate(token: string): Promise<AuthenticatedPrincipal> {
    const tokenHash = sha256(token);
    const cached = await this.readCache(tokenHash);
    if (cached) return this.toPrincipal(cached);

    const session = await this.prisma.client.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.idleExpiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      session.user.deletedAt
    ) {
      await this.redis.delete(this.cacheKey(tokenHash));
      throw new UnauthorizedException('Authentication required');
    }

    let idleExpiresAt = session.idleExpiresAt;
    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      LAST_SEEN_WRITE_INTERVAL_MS
    ) {
      idleExpiresAt = new Date(
        Math.min(
          now.getTime() + this.idleTtl(session.user.role),
          session.expiresAt.getTime(),
        ),
      );
      await this.prisma.client.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { idleExpiresAt, lastSeenAt: now },
      });
    }

    const value: CachedSession = {
      sessionId: session.id,
      tokenHash,
      csrfSecretHash: session.csrfSecretHash,
      expiresAt: session.expiresAt.toISOString(),
      idleExpiresAt: idleExpiresAt.toISOString(),
      user: this.publicUser(session.user),
    };
    await this.cache(value);
    return this.toPrincipal(value);
  }

  async revoke(principal: AuthenticatedPrincipal): Promise<void> {
    const now = new Date();
    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.session.updateMany({
        where: { id: principal.sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'user_logout' },
      });
      await transaction.auditLog.create({
        data: {
          actorId: principal.user.id,
          action: 'auth.logout',
          resourceType: 'session',
          resourceId: principal.sessionId,
        },
      });
    });
    await this.redis.delete(this.cacheKey(principal.tokenHash));
  }

  async rotateCsrf(principal: AuthenticatedPrincipal): Promise<string> {
    const csrfToken = randomBytes(32).toString('base64url');
    const updated = await this.prisma.client.session.updateMany({
      where: { id: principal.sessionId, revokedAt: null },
      data: { csrfSecretHash: sha256(csrfToken) },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException('Authentication required');
    }
    await this.redis.delete(this.cacheKey(principal.tokenHash));
    return csrfToken;
  }

  private async cache(value: CachedSession): Promise<void> {
    const now = Date.now();
    const remainingSeconds = Math.floor(
      (Math.min(
        new Date(value.expiresAt).getTime(),
        new Date(value.idleExpiresAt).getTime(),
      ) -
        now) /
        1_000,
    );
    await this.redis.setWithExpiry(
      this.cacheKey(value.tokenHash),
      JSON.stringify(value),
      Math.min(CACHE_TTL_SECONDS, remainingSeconds),
    );
  }

  private async readCache(tokenHash: string): Promise<CachedSession | null> {
    const raw = await this.redis.get(this.cacheKey(tokenHash));
    if (!raw) return null;

    try {
      const value = JSON.parse(raw) as CachedSession;
      const now = Date.now();
      if (
        value.tokenHash !== tokenHash ||
        new Date(value.expiresAt).getTime() <= now ||
        new Date(value.idleExpiresAt).getTime() <= now
      ) {
        await this.redis.delete(this.cacheKey(tokenHash));
        return null;
      }
      return value;
    } catch {
      await this.redis.delete(this.cacheKey(tokenHash));
      return null;
    }
  }

  private toPrincipal(value: CachedSession): AuthenticatedPrincipal {
    return {
      sessionId: value.sessionId,
      tokenHash: value.tokenHash,
      csrfSecretHash: value.csrfSecretHash,
      user: value.user,
    };
  }

  private publicUser(user: User): AuthenticatedPrincipal['user'] {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private idleTtl(role: UserRole): number {
    return role === UserRole.ADMIN ? ADMIN_IDLE_TTL_MS : USER_IDLE_TTL_MS;
  }

  private cacheKey(tokenHash: string): string {
    return `session:${tokenHash}`;
  }
}
