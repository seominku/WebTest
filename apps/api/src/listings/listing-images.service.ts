import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AgencyStatus,
  AgentStatus,
  ListingImageStatus,
  ListingStatus,
  Prisma,
  UserStatus,
} from '@real-estate/db';
import type { ListingImage } from '@real-estate/shared';
import { fileTypeFromBuffer } from 'file-type';
import { createHash, randomUUID } from 'node:crypto';
import { hmacRequestValue } from '../auth/auth-security.js';
import type { RequestContext } from '../auth/auth.types.js';
import { ObjectStorageService } from '../infrastructure/object-storage.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type {
  ListingImageVersionDto,
  ReorderListingImagesDto,
} from './dto/listing-image.dto.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EDITABLE_STATUSES: ListingStatus[] = [
  ListingStatus.DRAFT,
  ListingStatus.NEEDS_CHANGES,
];
export const MAX_LISTING_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_LISTING_IMAGES = 20;

@Injectable()
export class ListingImagesService {
  private readonly logger = new Logger(ListingImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async upload(
    userId: string,
    listingId: string,
    input: ListingImageVersionDto,
    file: Express.Multer.File | undefined,
    context: RequestContext,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Image file is required');
    }
    if (file.size > MAX_LISTING_IMAGE_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller');
    }

    const detected = await fileTypeFromBuffer(file.buffer);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new BadRequestException('Only JPEG, PNG, and WebP are allowed');
    }

    const listing = await this.ownedEditableListing(userId, listingId);
    if (listing.images.length >= MAX_LISTING_IMAGES) {
      throw new BadRequestException('A listing can have up to 20 images');
    }
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    if (listing.images.some((image) => image.sha256 === sha256)) {
      throw new ConflictException('This image is already attached');
    }

    const objectKey = `listing-images/${listingId}/${randomUUID()}/quarantine.${detected.ext}`;
    await this.storage.putObject(objectKey, file.buffer, detected.mime);
    try {
      const image = await this.prisma.client.$transaction(
        async (transaction) => {
          const updated = await transaction.listing.updateMany({
            data: { version: { increment: 1 } },
            where: {
              agentId: listing.agentId,
              deletedAt: null,
              id: listingId,
              status: { in: EDITABLE_STATUSES },
              version: input.version,
            },
          });
          if (updated.count !== 1) {
            throw new ConflictException(
              'Listing changed. Reload and try again',
            );
          }
          const created = await transaction.listingImage.create({
            data: {
              listingId,
              mimeType: detected.mime,
              objectKey,
              sha256,
              sizeBytes: file.size,
              sortOrder: listing.images.length,
              status: ListingImageStatus.UPLOADED,
            },
          });
          await transaction.listingHistory.create({
            data: {
              actorId: userId,
              changes: {
                fromVersion: input.version,
                imageId: created.id,
                toVersion: input.version + 1,
              },
              eventType: 'listing.image_uploaded',
              listingId,
            },
          });
          await transaction.auditLog.create({
            data: {
              action: 'listing.image_uploaded',
              actorId: userId,
              ipHash: hmacRequestValue(context.ip),
              metadata: {
                imageId: created.id,
                queuedForScanning: true,
                sizeBytes: file.size,
              },
              resourceId: listingId,
              resourceType: 'listing',
            },
          });
          return created;
        },
      );
      return {
        image: this.toImage(image, listingId, true),
        version: input.version + 1,
      };
    } catch (error) {
      await this.storage
        .deleteObject(objectKey)
        .catch((cleanupError: unknown) =>
          this.logger.error(
            'Failed to clean up an unreferenced image',
            cleanupError,
          ),
        );
      throw error;
    }
  }

  async remove(
    userId: string,
    listingId: string,
    imageId: string,
    input: ListingImageVersionDto,
    context: RequestContext,
  ) {
    const listing = await this.ownedEditableListing(userId, listingId);
    const image = listing.images.find((candidate) => candidate.id === imageId);
    if (!image) throw new NotFoundException('Image not found');

    await this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: { version: { increment: 1 } },
        where: {
          agentId: listing.agentId,
          deletedAt: null,
          id: listingId,
          status: { in: EDITABLE_STATUSES },
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Listing changed. Reload and try again');
      }
      await transaction.listingImage.delete({ where: { id: imageId } });
      await this.resequence(
        transaction,
        listing.images
          .filter((candidate) => candidate.id !== imageId)
          .map((item) => item.id),
      );
      await transaction.listingHistory.create({
        data: {
          actorId: userId,
          changes: {
            fromVersion: input.version,
            imageId,
            toVersion: input.version + 1,
          },
          eventType: 'listing.image_removed',
          listingId,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.image_removed',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { imageId },
          resourceId: listingId,
          resourceType: 'listing',
        },
      });
    });
    await this.storage
      .deleteObject(image.objectKey)
      .catch((error: unknown) =>
        this.logger.error('Failed to delete image content', error),
      );
    if (image.thumbnailObjectKey) {
      await this.storage
        .deleteObject(image.thumbnailObjectKey)
        .catch((error: unknown) =>
          this.logger.error('Failed to delete image thumbnail', error),
        );
    }
    return { status: 'ok', version: input.version + 1 };
  }

  async reorder(
    userId: string,
    listingId: string,
    input: ReorderListingImagesDto,
    context: RequestContext,
  ) {
    const listing = await this.ownedEditableListing(userId, listingId);
    const currentIds = listing.images.map((image) => image.id).sort();
    const requestedIds = [...input.imageIds].sort();
    if (
      currentIds.length !== requestedIds.length ||
      currentIds.some((id, index) => id !== requestedIds[index])
    ) {
      throw new BadRequestException(
        'imageIds must contain every listing image once',
      );
    }

    await this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: { version: { increment: 1 } },
        where: {
          agentId: listing.agentId,
          deletedAt: null,
          id: listingId,
          status: { in: EDITABLE_STATUSES },
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Listing changed. Reload and try again');
      }
      await this.resequence(transaction, input.imageIds);
      await transaction.listingHistory.create({
        data: {
          actorId: userId,
          changes: {
            fromVersion: input.version,
            imageIds: input.imageIds,
            toVersion: input.version + 1,
          },
          eventType: 'listing.images_reordered',
          listingId,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.images_reordered',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { imageIds: input.imageIds },
          resourceId: listingId,
          resourceType: 'listing',
        },
      });
    });
    return { status: 'ok', version: input.version + 1 };
  }

  async ownerContent(
    userId: string,
    listingId: string,
    imageId: string,
    thumbnail = false,
  ) {
    const image = await this.prisma.client.listingImage.findFirst({
      where: {
        id: imageId,
        listingId,
        listing: { is: { agent: { is: { userId } }, deletedAt: null } },
        status: ListingImageStatus.READY,
      },
    });
    if (!image) throw new NotFoundException('Image not found');
    const objectKey = thumbnail ? image.thumbnailObjectKey : image.objectKey;
    if (!objectKey) throw new NotFoundException('Image not found');
    return this.storage.getObject(objectKey);
  }

  async publicContent(listingId: string, imageId: string, thumbnail = false) {
    const now = new Date();
    const image = await this.prisma.client.listingImage.findFirst({
      where: {
        id: imageId,
        listingId,
        listing: {
          is: {
            deletedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            publishedAt: { lte: now },
            status: ListingStatus.PUBLISHED,
          },
        },
        status: ListingImageStatus.READY,
      },
    });
    if (!image) throw new NotFoundException('Image not found');
    const objectKey = thumbnail ? image.thumbnailObjectKey : image.objectKey;
    if (!objectKey) throw new NotFoundException('Image not found');
    return this.storage.getObject(objectKey);
  }

  private async ownedEditableListing(userId: string, listingId: string) {
    const listing = await this.prisma.client.listing.findFirst({
      include: { images: { orderBy: { sortOrder: 'asc' } } },
      where: {
        agent: {
          is: {
            agency: { is: { deletedAt: null, status: AgencyStatus.ACTIVE } },
            status: AgentStatus.ACTIVE,
            user: {
              is: { deletedAt: null, id: userId, status: UserStatus.ACTIVE },
            },
          },
        },
        deletedAt: null,
        id: listingId,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw new ConflictException(
        'Images can only be changed while editing a draft',
      );
    }
    return listing;
  }

  private async resequence(
    transaction: Prisma.TransactionClient,
    imageIds: string[],
  ) {
    for (const [index, id] of imageIds.entries()) {
      await transaction.listingImage.update({
        data: { sortOrder: -(index + 1) },
        where: { id },
      });
    }
    for (const [index, id] of imageIds.entries()) {
      await transaction.listingImage.update({
        data: { sortOrder: index },
        where: { id },
      });
    }
  }

  static toImagePath(listingId: string, imageId: string, owner = false) {
    return owner
      ? `/listings/mine/${listingId}/images/${imageId}/content`
      : `/listings/${listingId}/images/${imageId}/content`;
  }

  static toThumbnailPath(listingId: string, imageId: string, owner = false) {
    return owner
      ? `/listings/mine/${listingId}/images/${imageId}/thumbnail`
      : `/listings/${listingId}/images/${imageId}/thumbnail`;
  }

  private toImage(
    image: {
      height: number | null;
      id: string;
      mimeType: string;
      rejectionReason: string | null;
      sizeBytes: number;
      sortOrder: number;
      status: ListingImageStatus;
      thumbnailObjectKey: string | null;
      width: number | null;
    },
    listingId: string,
    owner: boolean,
  ): ListingImage {
    const ready = image.status === ListingImageStatus.READY;
    return {
      contentPath: ready
        ? ListingImagesService.toImagePath(listingId, image.id, owner)
        : null,
      height: image.height,
      id: image.id,
      mimeType: image.mimeType,
      rejectionReason: image.rejectionReason,
      sizeBytes: image.sizeBytes,
      sortOrder: image.sortOrder,
      status: image.status,
      thumbnailPath:
        ready && image.thumbnailObjectKey
          ? ListingImagesService.toThumbnailPath(listingId, image.id, owner)
          : null,
      width: image.width,
    };
  }
}
