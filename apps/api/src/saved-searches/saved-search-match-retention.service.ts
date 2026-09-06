import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../infrastructure/prisma.service.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

@Injectable()
export class SavedSearchMatchRetentionService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SavedSearchMatchRetentionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!this.prisma.isConfigured) return;
    void this.cleanup().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async cleanup(): Promise<number> {
    if (this.running || !this.prisma.isConfigured) return 0;
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - RETENTION_MS);
      const result = await this.prisma.client.savedSearchMatch.deleteMany({
        where: { createdAt: { lt: cutoff }, viewedAt: { not: null } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Deleted ${result.count} viewed saved-search notification(s) older than 180 days`,
        );
      }
      return result.count;
    } finally {
      this.running = false;
    }
  }
}
