import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingExpirationService } from './listing-expiration.service.js';
import { ListingImagesService } from './listing-images.service.js';
import { ListingImageProcessingService } from './listing-image-processing.service.js';
import { ListingImageOrphanCleanupService } from './listing-image-orphan-cleanup.service.js';
import { ListingsService } from './listings.service.js';
import { GeocodingService } from './geocoding.service.js';
import { SavedSearchesModule } from '../saved-searches/saved-searches.module.js';

@Module({
  controllers: [ListingsController],
  imports: [AuthModule, SavedSearchesModule],
  providers: [
    ListingsService,
    ListingExpirationService,
    ListingImagesService,
    ListingImageProcessingService,
    ListingImageOrphanCleanupService,
    GeocodingService,
  ],
  exports: [ListingImageOrphanCleanupService],
})
export class ListingsModule {}
