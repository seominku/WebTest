import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@real-estate/db';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthenticationGuard } from '../auth/guards/authentication.guard.js';
import { CsrfGuard } from '../auth/guards/csrf.guard.js';
import { JsonRequestGuard } from '../auth/guards/json-request.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { TrustedOriginGuard } from '../auth/guards/trusted-origin.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { ListListingsDto } from './dto/list-listings.dto.js';
import {
  ListingImageVersionDto,
  ReorderListingImagesDto,
} from './dto/listing-image.dto.js';
import {
  ListingVersionDto,
  PublishListingDto,
} from './dto/listing-lifecycle.dto.js';
import {
  ReviewListingDto,
  SubmitListingReviewDto,
} from './dto/review-listing.dto.js';
import { SaveListingDto, UpdateListingDto } from './dto/save-listing.dto.js';
import { ListingsService } from './listings.service.js';
import {
  ListingImagesService,
  MAX_LISTING_IMAGE_BYTES,
} from './listing-images.service.js';

@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listings: ListingsService,
    private readonly images: ListingImagesService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  findAll(@Query() input: ListListingsDto) {
    return this.listings.findAll(input);
  }

  @Get('favorites')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(AuthenticationGuard)
  favorites(@Req() request: AuthenticatedRequest) {
    return this.listings.findFavorites(request.auth.user.id);
  }

  @Post(':id/favorite')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(
    AuthenticationGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  addFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.listings.addFavorite(request.auth.user.id, id);
  }

  @Delete(':id/favorite')
  @Header('Cache-Control', 'private, no-store')
  @UseGuards(
    AuthenticationGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  removeFavorite(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.listings.removeFavorite(request.auth.user.id, id);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(AuthenticationGuard, RolesGuard)
  findMine(@Req() request: AuthenticatedRequest) {
    return this.listings.findMine(request.auth.user.id);
  }

  @Get('mine/:id')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(AuthenticationGuard, RolesGuard)
  findMineOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.listings.findMineOne(request.auth.user.id, id);
  }

  @Post('mine/:id/images')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(AuthenticationGuard, RolesGuard, TrustedOriginGuard, CsrfGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: MAX_LISTING_IMAGE_BYTES, files: 1 },
    }),
  )
  uploadImage(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ListingImageVersionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.images.upload(request.auth.user.id, id, input, file, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Put('mine/:id/images/order')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  reorderImages(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ReorderListingImagesDto,
  ) {
    return this.images.reorder(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Delete('mine/:id/images/:imageId')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  removeImage(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Body() input: ListingImageVersionDto,
  ) {
    return this.images.remove(request.auth.user.id, id, imageId, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Get('mine/:id/images/:imageId/content')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(AuthenticationGuard, RolesGuard)
  async ownerImageContent(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Res() response: Response,
  ) {
    const content = await this.images.ownerContent(
      request.auth.user.id,
      id,
      imageId,
    );
    response.type(content.contentType).send(Buffer.from(content.body));
  }

  @Get('mine/:id/images/:imageId/thumbnail')
  @Header('Cache-Control', 'private, no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(AuthenticationGuard, RolesGuard)
  async ownerImageThumbnail(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Res() response: Response,
  ) {
    const content = await this.images.ownerContent(
      request.auth.user.id,
      id,
      imageId,
      true,
    );
    response.type(content.contentType).send(Buffer.from(content.body));
  }

  @Get('review-queue')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthenticationGuard, RolesGuard)
  reviewQueue() {
    return this.listings.reviewQueue();
  }

  @Get('publication-queue')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthenticationGuard, RolesGuard)
  publicationQueue() {
    return this.listings.publicationQueue();
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  create(@Req() request: AuthenticatedRequest, @Body() input: SaveListingDto) {
    return this.listings.create(request.auth.user.id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/submit-review')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  submitReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: SubmitListingReviewDto,
  ) {
    return this.listings.submitReview(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/review')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  review(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ReviewListingDto,
  ) {
    return this.listings.review(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/publish')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.ADMIN)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: PublishListingDto,
  ) {
    return this.listings.publish(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/pause')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  pause(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ListingVersionDto,
  ) {
    return this.listings.pause(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/resume')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  resume(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ListingVersionDto,
  ) {
    return this.listings.resume(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Post(':id/complete')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: ListingVersionDto,
  ) {
    return this.listings.complete(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Get(':id/images/:imageId/content')
  @Header('Cache-Control', 'public, max-age=3600')
  async publicImageContent(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Res() response: Response,
  ) {
    const content = await this.images.publicContent(id, imageId);
    response.type(content.contentType).send(Buffer.from(content.body));
  }

  @Get(':id/images/:imageId/thumbnail')
  @Header('Cache-Control', 'public, max-age=3600')
  async publicImageThumbnail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Res() response: Response,
  ) {
    const content = await this.images.publicContent(id, imageId, true);
    response.type(content.contentType).send(Buffer.from(content.body));
  }

  @Put(':id')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.AGENT)
  @UseGuards(
    AuthenticationGuard,
    RolesGuard,
    TrustedOriginGuard,
    JsonRequestGuard,
    CsrfGuard,
  )
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() input: UpdateListingDto,
  ) {
    return this.listings.update(request.auth.user.id, id, input, {
      ip: request.ip,
      userAgent: request.header('user-agent'),
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.listings.findOne(id);
  }
}
