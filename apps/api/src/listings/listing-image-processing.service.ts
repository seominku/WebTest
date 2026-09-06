import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ListingImageStatus } from '@real-estate/db';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import {
  ClamAvScannerService,
  MalwareDetectedError,
} from '../infrastructure/clamav-scanner.service.js';
import { ObjectStorageService } from '../infrastructure/object-storage.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';

const PROCESS_INTERVAL_MS = 2_000;
const STALE_PROCESSING_MS = 10 * 60 * 1_000;
const MAX_PROCESSING_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 60 * 1_000;
const MAX_INPUT_PIXELS = 40_000_000;
const MIN_IMAGE_WIDTH = 640;
const MIN_IMAGE_HEIGHT = 480;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

class ImageRejectedError extends Error {}

@Injectable()
export class ListingImageProcessingService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ListingImageProcessingService.name);
  private running = false;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly scanner: ClamAvScannerService,
  ) {}

  onModuleInit(): void {
    if (
      !this.prisma.isConfigured ||
      !this.storage.isConfigured ||
      !this.scanner.isConfigured
    ) {
      return;
    }
    this.runScheduledProcessing();
    this.timer = setInterval(
      () => this.runScheduledProcessing(),
      PROCESS_INTERVAL_MS,
    );
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private runScheduledProcessing(): void {
    // A failed queue query must not become an unhandled rejection that exits Node.
    // processDueImages resets its running flag in finally; the next tick retries.
    void this.processDueImages().catch(() => {
      this.logger.error(
        'Image processing cycle failed; retrying on the next tick',
      );
    });
  }

  async processDueImages(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      await this.recoverStaleProcessing();
      const queued = await this.prisma.client.listingImage.findMany({
        orderBy: { createdAt: 'asc' },
        take: 10,
        where: {
          status: ListingImageStatus.UPLOADED,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
        },
      });
      for (const image of queued) {
        const claimed = await this.prisma.client.listingImage.updateMany({
          data: {
            processingStartedAt: new Date(),
            nextAttemptAt: null,
            processingAttempts: { increment: 1 },
            rejectionReason: null,
            status: ListingImageStatus.SCANNING,
          },
          where: { id: image.id, status: ListingImageStatus.UPLOADED },
        });
        if (claimed.count !== 1) continue;
        try {
          await this.processOne(image);
          processed += 1;
        } catch (error) {
          if (
            error instanceof ImageRejectedError ||
            error instanceof MalwareDetectedError
          ) {
            await this.reject(
              image.id,
              image.listingId,
              error instanceof MalwareDetectedError
                ? `Malware detected: ${error.signature}`
                : error.message,
            );
            await this.deleteQuietly(image.objectKey);
            processed += 1;
          } else {
            const attempts = image.processingAttempts + 1;
            if (attempts >= MAX_PROCESSING_ATTEMPTS) {
              await this.reject(
                image.id,
                image.listingId,
                `Image processing failed after ${MAX_PROCESSING_ATTEMPTS} attempts`,
              );
              await this.deleteQuietly(image.objectKey);
              processed += 1;
              continue;
            }
            const delay = Math.min(
              MAX_RETRY_DELAY_MS,
              2 ** Math.max(0, attempts - 1) * PROCESS_INTERVAL_MS,
            );
            await this.prisma.client.listingImage.updateMany({
              data: {
                nextAttemptAt: new Date(Date.now() + delay),
                processingStartedAt: null,
                status: ListingImageStatus.UPLOADED,
              },
              where: { id: image.id, status: ListingImageStatus.SCANNING },
            });
            this.logger.error(
              `Image processing will be retried: ${image.id}`,
              error,
            );
          }
        }
      }
      return processed;
    } finally {
      this.running = false;
    }
  }

  private async processOne(image: {
    id: string;
    listingId: string;
    objectKey: string;
    processingAttempts: number;
  }) {
    const source = await this.storage.getObject(image.objectKey);
    await this.scanner.scan(source.body);
    const detected = await fileTypeFromBuffer(source.body);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new ImageRejectedError('Unsupported image content');
    }

    let full: Buffer;
    let thumbnail: Buffer;
    let width: number;
    let height: number;
    try {
      const pipeline = sharp(source.body, {
        animated: false,
        failOn: 'warning',
        limitInputPixels: MAX_INPUT_PIXELS,
      }).rotate();
      const fullResult = await pipeline
        .clone()
        .webp({ quality: 85 })
        .toBuffer({ resolveWithObject: true });
      width = fullResult.info.width;
      height = fullResult.info.height;
      if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
        throw new ImageRejectedError('Image must be at least 640 × 480 pixels');
      }
      full = fullResult.data;
      thumbnail = await pipeline
        .clone()
        .resize({ fit: 'cover', height: 400, width: 640 })
        .webp({ quality: 75 })
        .toBuffer();
    } catch (error) {
      if (error instanceof ImageRejectedError) throw error;
      throw new ImageRejectedError('Image is damaged or unsafe to process');
    }

    const baseKey = image.objectKey.replace(/\/quarantine\.[^/]+$/u, '');
    const fullKey = `${baseKey}/full.webp`;
    const thumbnailKey = `${baseKey}/thumbnail.webp`;
    await this.storage.putObject(fullKey, full, 'image/webp');
    try {
      await this.storage.putObject(thumbnailKey, thumbnail, 'image/webp');
      const committed = await this.prisma.client.$transaction(
        async (transaction) => {
          const updated = await transaction.listingImage.updateMany({
            data: {
              height,
              mimeType: 'image/webp',
              objectKey: fullKey,
              processingStartedAt: null,
              rejectionReason: null,
              sizeBytes: full.length,
              status: ListingImageStatus.READY,
              thumbnailObjectKey: thumbnailKey,
              width,
            },
            where: { id: image.id, status: ListingImageStatus.SCANNING },
          });
          if (updated.count !== 1) return false;
          await transaction.listingHistory.create({
            data: {
              changes: { imageId: image.id, thumbnailGenerated: true },
              eventType: 'listing.image_ready',
              listingId: image.listingId,
            },
          });
          await transaction.auditLog.create({
            data: {
              action: 'listing.image_ready',
              metadata: { imageId: image.id, malwareScan: 'clean' },
              resourceId: image.listingId,
              resourceType: 'listing',
            },
          });
          return true;
        },
      );
      if (!committed) {
        await this.deleteQuietly(fullKey);
        await this.deleteQuietly(thumbnailKey);
        return;
      }
      await this.deleteQuietly(image.objectKey);
    } catch (error) {
      await this.deleteQuietly(fullKey);
      await this.deleteQuietly(thumbnailKey);
      throw error;
    }
  }

  private async reject(imageId: string, listingId: string, reason: string) {
    const rejectionReason = reason.slice(0, 255);
    await this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listingImage.updateMany({
        data: {
          processingStartedAt: null,
          rejectionReason,
          status: ListingImageStatus.REJECTED,
        },
        where: { id: imageId, status: ListingImageStatus.SCANNING },
      });
      if (updated.count !== 1) return;
      await transaction.listingHistory.create({
        data: {
          changes: { imageId, rejectionReason },
          eventType: 'listing.image_rejected',
          listingId,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.image_rejected',
          metadata: { imageId, rejectionReason },
          resourceId: listingId,
          resourceType: 'listing',
        },
      });
    });
  }

  private async recoverStaleProcessing() {
    const cutoff = new Date(Date.now() - STALE_PROCESSING_MS);
    const recovered = await this.prisma.client.listingImage.updateMany({
      data: {
        processingStartedAt: null,
        nextAttemptAt: null,
        status: ListingImageStatus.UPLOADED,
      },
      where: {
        processingStartedAt: { lt: cutoff },
        status: ListingImageStatus.SCANNING,
      },
    });
    if (recovered.count > 0) {
      this.logger.warn(`Recovered ${recovered.count} stale image job(s)`);
    }
  }

  private async deleteQuietly(key: string) {
    await this.storage
      .deleteObject(key)
      .catch((error: unknown) =>
        this.logger.error(`Failed to delete image object: ${key}`, error),
      );
  }
}
