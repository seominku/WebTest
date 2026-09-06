import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SavedSearchesController } from './saved-searches.controller.js';
import { SavedSearchesService } from './saved-searches.service.js';
import { SavedSearchMatchRetentionService } from './saved-search-match-retention.service.js';

@Module({
  controllers: [SavedSearchesController],
  exports: [SavedSearchesService],
  imports: [AuthModule],
  providers: [SavedSearchesService, SavedSearchMatchRetentionService],
})
export class SavedSearchesModule {}
