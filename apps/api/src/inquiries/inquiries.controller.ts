import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { PageQueryDto } from '../common/dto/page-query.dto.js';
import { CreateInquiryDto, RespondInquiryDto } from './dto/inquiry.dto.js';
import { InquiriesService } from './inquiries.service.js';

@Controller('inquiries')
@UseGuards(AuthenticationGuard)
export class InquiriesController {
  constructor(private readonly inquiries: InquiriesService) {}

  @Get('mine')
  @Header('Cache-Control', 'private, no-store')
  mine(@Req() request: AuthenticatedRequest, @Query() query: PageQueryDto) {
    return this.inquiries.findMine(request.auth.user.id, query);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.inquiries.unreadCount(request.auth.user.id);
  }

  @Post('responses/viewed')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  markResponsesViewed(@Req() request: AuthenticatedRequest) {
    return this.inquiries.markResponsesViewed(request.auth.user.id, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('received')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(RolesGuard)
  received(@Req() request: AuthenticatedRequest, @Query() query: PageQueryDto) {
    return this.inquiries.findReceived(request.auth.user.id, query);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateInquiryDto,
  ) {
    return this.inquiries.create(request.auth.user.id, input, {
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
    @Body() input: RespondInquiryDto,
  ) {
    return this.inquiries.respond(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/close')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  close(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.inquiries.close(request.auth.user.id, id, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }
}
