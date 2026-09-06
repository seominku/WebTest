import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthenticationGuard } from './guards/authentication.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JsonRequestGuard } from './guards/json-request.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';
import { SessionService } from './session.service.js';
import { RateLimitService } from './rate-limit.service.js';

@Module({
  controllers: [AuthController],
  exports: [
    AuthenticationGuard,
    CsrfGuard,
    JsonRequestGuard,
    RolesGuard,
    SessionService,
    TrustedOriginGuard,
  ],
  providers: [
    AuthService,
    SessionService,
    AuthenticationGuard,
    CsrfGuard,
    JsonRequestGuard,
    RateLimitGuard,
    RateLimitService,
    RolesGuard,
    TrustedOriginGuard,
  ],
})
export class AuthModule {}
