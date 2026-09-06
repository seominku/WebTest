import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ObjectStorageService } from '../infrastructure/object-storage.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ORPHAN_RETENTION_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class ListingImageOrphanCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ListingImageOrphanCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastRunAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private lastDeleted = 0;
  private lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  onModuleInit(): void {
    if (!this.prisma.isConfigured || !this.storage.isConfigured) return;
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
    if (this.running || !this.prisma.isConfigured || !this.storage.isConfigured)
      return 0;
    this.running = true;
    this.lastRunAt = new Date();
    try {
      const [images, objects] = await Promise.all([
        this.prisma.client.listingImage.findMany({
          select: { objectKey: true, thumbnailObjectKey: true },
        }),
        this.storage.listObjects('listing-images/'),
      ]);
      const referenced = new Set<string>();
      for (const image of images) {
        referenced.add(image.objectKey);
        if (image.thumbnailObjectKey) referenced.add(image.thumbnailObjectKey);
      }
      const cutoff = Date.now() - ORPHAN_RETENTION_MS;
      let deleted = 0;
      for (const object of objects) {
        if (
          referenced.has(object.key) ||
          !object.lastModified ||
          object.lastModified.getTime() > cutoff
        )
          continue;
        await this.storage.deleteObject(object.key);
        deleted += 1;
      }
      if (deleted > 0)
        this.logger.log(`Deleted ${deleted} orphan image object(s)`);
      this.lastDeleted = deleted;
      this.lastSuccessAt = new Date();
      this.lastError = null;
      return deleted;
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : 'Unknown cleanup error';
      this.logger.error('Orphan image cleanup failed', error);
      throw error;
    } finally {
      this.running = false;
    }
  }

  metrics() {
    return {
      lastDeleted: this.lastDeleted,
      lastError: this.lastError,
      lastRunAt: this.lastRunAt?.toISOString() ?? null,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      running: this.running,
    };
  }
}
