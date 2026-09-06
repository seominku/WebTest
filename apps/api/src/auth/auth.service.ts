import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenType, UserStatus, type User } from '@real-estate/db';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { hmacRequestValue, sha256 } from './auth-security.js';
import type { RequestContext } from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import { SessionService, type CreatedSession } from './session.service.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=1,t=3$cXFt8llSAnmE214ce+o7ng$ukTIcEcBoWBQwDMxTadZ5i4JguPWgl7jBZSbXMluTW4';
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1_000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1_000;

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: User['role'];
  status: User['status'];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async register(
    input: RegisterDto,
  ): Promise<{ user: PublicUser; verificationToken?: string }> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
    });
    const verificationToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    try {
      const user = await this.prisma.client.$transaction(
        async (transaction) => {
          const created = await transaction.user.create({
            data: {
              email: input.email,
              passwordHash,
              displayName: input.displayName,
            },
          });
          await transaction.authToken.create({
            data: {
              userId: created.id,
              type: AuthTokenType.EMAIL_VERIFICATION,
              tokenHash: sha256(verificationToken),
              expiresAt,
            },
          });
          await transaction.auditLog.create({
            data: {
              actorId: created.id,
              action: 'auth.registration.created',
              resourceType: 'user',
              resourceId: created.id,
            },
          });
          return created;
        },
      );
      return {
        user: this.publicUser(user),
        ...(this.canReturnVerificationToken() ? { verificationToken } : {}),
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Unable to create account');
      }
      throw error;
    }
  }

  async verifyEmail(token: string): Promise<PublicUser> {
    const now = new Date();
    const tokenHash = sha256(token);

    const user = await this.prisma.client.$transaction(async (transaction) => {
      const authToken = await transaction.authToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (
        !authToken ||
        authToken.type !== AuthTokenType.EMAIL_VERIFICATION ||
        authToken.consumedAt ||
        authToken.expiresAt <= now ||
        authToken.user.deletedAt
      ) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      const consumed = await transaction.authToken.updateMany({
        where: { id: authToken.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Invalid or expired verification token');
      }

      const verified = await transaction.user.update({
        where: { id: authToken.userId },
        data: { status: UserStatus.ACTIVE, emailVerifiedAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorId: verified.id,
          action: 'auth.email.verified',
          resourceType: 'user',
          resourceId: verified.id,
        },
      });
      return verified;
    });

    return this.publicUser(user);
  }

  async login(
    input: LoginDto,
    context: RequestContext,
  ): Promise<{ user: PublicUser; session: CreatedSession }> {
    const user = await this.prisma.client.user.findUnique({
      where: { email: input.email },
    });
    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
      input.password,
    );
    const now = new Date();

    if (
      !user ||
      !passwordMatches ||
      user.status !== UserStatus.ACTIVE ||
      user.deletedAt ||
      (user.lockedUntil && user.lockedUntil > now)
    ) {
      if (user && !passwordMatches) {
        await this.recordFailedLogin(user, context);
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    return {
      user: this.publicUser(user),
      session: await this.sessions.create(user, context),
    };
  }

  private async recordFailedLogin(
    user: User,
    context: RequestContext,
  ): Promise<void> {
    const failureCount = user.failedLoginCount + 1;
    const lockedUntil =
      failureCount >= LOGIN_FAILURE_LIMIT
        ? new Date(Date.now() + LOGIN_LOCK_MS)
        : null;
    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failureCount, lockedUntil },
      });
      await transaction.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.login.failed',
          resourceType: 'user',
          resourceId: user.id,
          ipHash: hmacRequestValue(context.ip),
          metadata: { failureCount, accountLocked: Boolean(lockedUntil) },
        },
      });
    });
  }

  private publicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private canReturnVerificationToken(): boolean {
    return process.env.APP_ENV === 'local' || process.env.APP_ENV === 'test';
  }
}
