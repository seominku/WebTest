import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';
import { MetricsTokenGuard } from './health/metrics-token.guard.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { InquiriesModule } from './inquiries/inquiries.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { SavedSearchesModule } from './saved-searches/saved-searches.module.js';
import { ViewingsModule } from './viewings/viewings.module.js';

@Module({
  imports: [
    InfrastructureModule,
    AuthModule,
    SavedSearchesModule,
    ListingsModule,
    InquiriesModule,
    ViewingsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, HealthService, MetricsTokenGuard],
})
export class AppModule {}
