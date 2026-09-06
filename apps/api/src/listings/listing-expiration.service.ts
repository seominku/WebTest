import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ListingStatus } from '@real-estate/db';
import { PrismaService } from '../infrastructure/prisma.service.js';

const EXPIRATION_INTERVAL_MS = 60_000;

@Injectable()
export class ListingExpirationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ListingExpirationService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!this.prisma.isConfigured) return;

    try {
      await this.expireDueListings();
    } catch (error) {
      this.logger.error('Initial listing expiration failed', error);
    }
    this.timer = setInterval(() => {
      void this.expireDueListings().catch((error: unknown) =>
        this.logger.error('Scheduled listing expiration failed', error),
      );
    }, EXPIRATION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async expireDueListings(now = new Date()): Promise<number> {
    const due = await this.prisma.client.listing.findMany({
      select: { id: true, status: true, version: true },
      take: 100,
      where: {
        deletedAt: null,
        expiresAt: { lte: now },
        status: { in: [ListingStatus.PUBLISHED, ListingStatus.PAUSED] },
      },
    });
    let expired = 0;

    for (const listing of due) {
      await this.prisma.client.$transaction(async (transaction) => {
        const updated = await transaction.listing.updateMany({
          data: {
            status: ListingStatus.EXPIRED,
            version: { increment: 1 },
          },
          where: {
            id: listing.id,
            status: listing.status,
            version: listing.version,
          },
        });
        if (updated.count !== 1) return;
        expired += 1;
        await transaction.listingHistory.create({
          data: {
            changes: {
              expiredAt: now.toISOString(),
              fromVersion: listing.version,
              toVersion: listing.version + 1,
            },
            eventType: 'listing.expired',
            fromStatus: listing.status,
            listingId: listing.id,
            toStatus: ListingStatus.EXPIRED,
          },
        });
        await transaction.auditLog.create({
          data: {
            action: 'listing.expired',
            metadata: { scheduled: true },
            resourceId: listing.id,
            resourceType: 'listing',
          },
        });
      });
    }
    return expired;
  }
}
