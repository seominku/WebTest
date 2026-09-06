import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@real-estate/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthenticationGuard } from '../auth/guards/authentication.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JsonRequestGuard } from '../auth/guards/json-request.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { TrustedOriginGuard } from '../auth/guards/trusted-origin.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import {
  CreateViewingDto,
  ProposeViewingRescheduleDto,
  RespondViewingDto,
  RespondViewingRescheduleDto,
} from './dto/viewing.dto.js';
import { ViewingsService } from './viewings.service.js';

@Controller('viewings')
@UseGuards(AuthenticationGuard)
export class ViewingsController {
  constructor(private readonly viewings: ViewingsService) {}

  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  mine(@Req() request: AuthenticatedRequest) {
    return this.viewings.findMine(request.auth.user.id);
  }

  @Get('received')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(RolesGuard)
  received(@Req() request: AuthenticatedRequest) {
    return this.viewings.findReceived(request.auth.user.id);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateViewingDto,
  ) {
    return this.viewings.create(request.auth.user.id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Put(':id/respond')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(RolesGuard, TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  respond(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: RespondViewingDto,
  ) {
    return this.viewings.respond(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/reschedule-proposals')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  proposeReschedule(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ProposeViewingRescheduleDto,
  ) {
    return this.viewings.proposeReschedule(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Put(':id/reschedule-proposals/respond')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  respondToReschedule(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: RespondViewingRescheduleDto,
  ) {
    return this.viewings.respondToReschedule(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/cancel')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.viewings.cancel(request.auth.user.id, id, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }
}
