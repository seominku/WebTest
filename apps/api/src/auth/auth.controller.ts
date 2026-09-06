import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '@real-estate/db';
import { clearSessionCookie, setSessionCookie } from './auth-cookie.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { AuthenticationGuard } from './guards/authentication.guard.js';
import { CsrfGuard } from './guards/csrf.guard.js';
import { JsonRequestGuard } from './guards/json-request.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { TrustedOriginGuard } from './guards/trusted-origin.guard.js';
import { Roles } from './roles.decorator.js';
import { RateLimits } from './rate-limit.decorator.js';
import { SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post('register')
  @Header('Cache-Control', 'no-store')
  @RateLimits({
    limit: 10,
    scope: 'auth-register-ip',
    subject: 'ip',
    windowSeconds: 900,
  })
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, RateLimitGuard)
  async register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('verify-email')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimits({
    limit: 30,
    scope: 'auth-verify-email-ip',
    subject: 'ip',
    windowSeconds: 900,
  })
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, RateLimitGuard)
  async verifyEmail(@Body() input: VerifyEmailDto) {
    return { user: await this.auth.verifyEmail(input.token) };
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @RateLimits(
    {
      limit: 60,
      scope: 'auth-login-ip',
      subject: 'ip',
      windowSeconds: 900,
    },
    {
      limit: 10,
      scope: 'auth-login-email',
      subject: 'email',
      windowSeconds: 900,
    },
  )
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, RateLimitGuard)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
    setSessionCookie(response, result.session.token, result.session.expiresAt);
    return { user: result.user, csrfToken: result.session.csrfToken };
  }

  @Get('me')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.USER, UserRole.AGENT, UserRole.ADMIN)
  @UseGuards(AuthenticationGuard, RolesGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.auth.user };
  }

  @Get('csrf')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthenticationGuard)
  async csrf(@Req() request: AuthenticatedRequest) {
    return { csrfToken: await this.sessions.rotateCsrf(request.auth) };
  }

  @Post('logout')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(
    AuthenticationGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.sessions.revoke(request.auth);
    clearSessionCookie(response);
    return { status: 'ok' };
  }
}
