import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthenticationGuard } from '../auth/guards/authentication.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JsonRequestGuard } from '../auth/guards/json-request.guard.js';
import { TrustedOriginGuard } from '../auth/guards/trusted-origin.guard.js';
import { PageQueryDto } from '../common/dto/page-query.dto.js';
import { CreateSavedSearchDto } from './dto/saved-search.dto.js';
import { SavedSearchesService } from './saved-searches.service.js';

@Controller('saved-searches')
@UseGuards(AuthenticationGuard)
export class SavedSearchesController {
  constructor(private readonly savedSearches: SavedSearchesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  findMine(@Req() request: AuthenticatedRequest) {
    return this.savedSearches.findMine(request.auth.user.id);
  }

  @Get('matches')
  @Header('Cache-Control', 'private, no-store')
  matches(@Req() request: AuthenticatedRequest, @Query() query: PageQueryDto) {
    return this.savedSearches.findMatches(request.auth.user.id, query);
  }

  @Get('unread-count')
  @Header('Cache-Control', 'private, no-store')
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.savedSearches.unreadCount(request.auth.user.id);
  }

  @Post('matches/viewed')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  markMatchesViewed(@Req() request: AuthenticatedRequest) {
    return this.savedSearches.markMatchesViewed(request.auth.user.id, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  create(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateSavedSearchDto,
  ) {
    return this.savedSearches.create(request.auth.user.id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(TrustedOriginGuard, JsonRequestGuard, CsrfGuard)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.savedSearches.remove(request.auth.user.id, id, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }
}
