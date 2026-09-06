import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@real-estate/db';
import type { HealthResponse } from '@real-estate/shared';
import { AuthenticationGuard } from '../auth/guards/authentication.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { ListingImageOrphanCleanupService } from '../listings/listing-image-orphan-cleanup.service.js';
import { HealthService } from './health.service.js';
import { MetricsTokenGuard } from './metrics-token.guard.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly orphanCleanup: ListingImageOrphanCleanupService,
  ) {}

  @Get('live')
  live(): HealthResponse {
    return this.response('ok');
  }

  @Get('ready')
  async ready() {
    const checks = await this.healthService.checkDependencies();
    const ready = checks.every((check) => check.status === 'up');
    const body = {
      ...this.response(ready ? 'ok' : 'unavailable'),
      checks,
    };

    if (!ready) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return body;
  }

  @Get('metrics')
  @Roles(UserRole.ADMIN)
  @UseGuards(AuthenticationGuard, RolesGuard)
  metrics() {
    return {
      service: 'api',
      timestamp: new Date().toISOString(),
      imageOrphanCleanup: this.orphanCleanup.metrics(),
    };
  }

  @Get('metrics/prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @UseGuards(MetricsTokenGuard)
  prometheusMetrics(): string {
    const metrics = this.orphanCleanup.metrics();
    const timestamp = (value: string | null) =>
      value ? Math.floor(new Date(value).getTime() / 1_000) : 0;
    return [
      '# HELP real_estate_image_orphan_cleanup_running Whether cleanup is currently running.',
      '# TYPE real_estate_image_orphan_cleanup_running gauge',
      `real_estate_image_orphan_cleanup_running ${metrics.running ? 1 : 0}`,
      '# HELP real_estate_image_orphan_cleanup_last_deleted Objects deleted by the latest cleanup.',
      '# TYPE real_estate_image_orphan_cleanup_last_deleted gauge',
      `real_estate_image_orphan_cleanup_last_deleted ${metrics.lastDeleted}`,
      '# HELP real_estate_image_orphan_cleanup_last_run_timestamp_seconds Latest cleanup start time.',
      '# TYPE real_estate_image_orphan_cleanup_last_run_timestamp_seconds gauge',
      `real_estate_image_orphan_cleanup_last_run_timestamp_seconds ${timestamp(metrics.lastRunAt)}`,
      '# HELP real_estate_image_orphan_cleanup_last_success_timestamp_seconds Latest successful cleanup time.',
      '# TYPE real_estate_image_orphan_cleanup_last_success_timestamp_seconds gauge',
      `real_estate_image_orphan_cleanup_last_success_timestamp_seconds ${timestamp(metrics.lastSuccessAt)}`,
      '# HELP real_estate_image_orphan_cleanup_last_error Whether the latest cleanup has an error.',
      '# TYPE real_estate_image_orphan_cleanup_last_error gauge',
      `real_estate_image_orphan_cleanup_last_error ${metrics.lastError ? 1 : 0}`,
      '',
    ].join('\n');
  }

  private response(status: HealthResponse['status']): HealthResponse {
    return {
      service: 'api',
      status,
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    };
  }
}
