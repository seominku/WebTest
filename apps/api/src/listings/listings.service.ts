import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AddressVisibility,
  AgencyStatus,
  AgentStatus,
  ListingImageStatus,
  ListingStatus,
  Prisma,
  ReviewDecision,
  UserStatus,
} from '@real-estate/db';
import type {
  PublicListingDetail,
  FavoriteListingsResponse,
  PublicListingSummary,
  PublicListingsResponse,
  ManagedListingDetail,
  ManagedListingSummary,
  ManagedListingsResponse,
  PublicationQueueResponse,
  ReviewQueueListing,
  ReviewQueueResponse,
} from '@real-estate/shared';
import { hmacRequestValue } from '../auth/auth-security.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type { ListListingsDto } from './dto/list-listings.dto.js';
import type {
  ListingVersionDto,
  PublishListingDto,
} from './dto/listing-lifecycle.dto.js';
import type {
  SaveListingDto,
  UpdateListingDto,
} from './dto/save-listing.dto.js';
import type {
  ReviewListingDto,
  SubmitListingReviewDto,
} from './dto/review-listing.dto.js';
import { GeocodingService } from './geocoding.service.js';
import { SavedSearchesService } from '../saved-searches/saved-searches.service.js';

const PUBLIC_LISTING_INCLUDE = {
  agent: {
    include: {
      agency: { select: { name: true, phone: true } },
      user: { select: { displayName: true } },
    },
  },
  images: {
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
    where: { status: ListingImageStatus.READY },
  },
  property: { include: { address: true } },
} satisfies Prisma.ListingInclude;

type PublicListingRecord = Prisma.ListingGetPayload<{
  include: typeof PUBLIC_LISTING_INCLUDE;
}>;

const MANAGED_LISTING_INCLUDE = {
  images: {
    orderBy: { sortOrder: 'asc' },
  },
  property: { include: { address: true } },
  reviews: {
    orderBy: { createdAt: 'desc' },
    select: { note: true },
    take: 1,
  },
} satisfies Prisma.ListingInclude;

type ManagedListingRecord = Prisma.ListingGetPayload<{
  include: typeof MANAGED_LISTING_INCLUDE;
}>;

const REVIEW_QUEUE_INCLUDE = {
  ...MANAGED_LISTING_INCLUDE,
  agent: {
    include: {
      agency: { select: { name: true } },
      user: { select: { displayName: true } },
    },
  },
} satisfies Prisma.ListingInclude;

type ReviewQueueRecord = Prisma.ListingGetPayload<{
  include: typeof REVIEW_QUEUE_INCLUDE;
}>;

const EDITABLE_STATUSES: ListingStatus[] = [
  ListingStatus.DRAFT,
  ListingStatus.NEEDS_CHANGES,
];

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
    private readonly savedSearches: SavedSearchesService,
  ) {}

  async findAll(input: ListListingsDto): Promise<PublicListingsResponse> {
    this.validatePublicRanges(input);
    const where = this.publicWhere(input);
    const skip = (input.page - 1) * input.pageSize;
    const [total, records] = await this.prisma.client.$transaction(
      async (transaction) => {
        const total = await transaction.listing.count({ where });
        const records = await transaction.listing.findMany({
          include: PUBLIC_LISTING_INCLUDE,
          orderBy: this.publicOrderBy(input),
          skip,
          take: input.pageSize,
          where,
        });
        return [total, records] as const;
      },
    );

    return {
      items: records.map((record) => this.toSummary(record)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async findOne(id: string): Promise<PublicListingDetail> {
    const record = await this.prisma.client.listing.findFirst({
      include: PUBLIC_LISTING_INCLUDE,
      where: { ...this.publicWhere(), id },
    });
    if (!record) throw new NotFoundException('Listing not found');

    return {
      ...this.toSummary(record),
      description: record.description,
      imagePaths: record.images.map(
        (image) => `/listings/${record.id}/images/${image.id}/content`,
      ),
    };
  }

  async findFavorites(userId: string): Promise<FavoriteListingsResponse> {
    const favorites = await this.prisma.client.favorite.findMany({
      include: { listing: { include: PUBLIC_LISTING_INCLUDE } },
      orderBy: { createdAt: 'desc' },
      where: { listing: this.publicWhere(), userId },
    });
    return {
      items: favorites.map((favorite) => this.toSummary(favorite.listing)),
    };
  }

  async addFavorite(userId: string, listingId: string) {
    const listing = await this.prisma.client.listing.findFirst({
      select: { id: true },
      where: { ...this.publicWhere(), id: listingId },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    await this.prisma.client.favorite.upsert({
      create: { listingId, userId },
      update: {},
      where: { userId_listingId: { listingId, userId } },
    });
    return { favorite: true, listingId };
  }

  async removeFavorite(userId: string, listingId: string) {
    await this.prisma.client.favorite.deleteMany({
      where: { listingId, userId },
    });
    return { favorite: false, listingId };
  }

  async findMine(userId: string): Promise<ManagedListingsResponse> {
    const agent = await this.activeAgent(userId);
    const records = await this.prisma.client.listing.findMany({
      include: MANAGED_LISTING_INCLUDE,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      where: {
        agentId: agent.id,
        deletedAt: null,
      },
    });
    return { items: records.map((record) => this.toManagedSummary(record)) };
  }

  async findMineOne(userId: string, id: string): Promise<ManagedListingDetail> {
    const agent = await this.activeAgent(userId);
    const record = await this.prisma.client.listing.findFirst({
      include: MANAGED_LISTING_INCLUDE,
      where: { agentId: agent.id, deletedAt: null, id },
    });
    if (!record) throw new NotFoundException('Listing not found');
    return this.toManagedDetail(record);
  }

  async create(
    userId: string,
    input: SaveListingDto,
    context: RequestContext,
  ): Promise<ManagedListingDetail> {
    const agent = await this.activeAgent(userId);
    const price = this.validatedPrice(input);
    this.validateFloors(input);
    const coordinates = await this.geocoding.geocode({
      postalCode: input.postalCode,
      roadAddress: input.roadAddress,
    });

    return this.prisma.client.$transaction(async (transaction) => {
      const property = await transaction.property.create({
        data: {
          agencyId: agent.agencyId,
          agentId: agent.id,
          areaSquareMeters: input.areaSquareMeters,
          bathrooms: input.bathrooms,
          buildYear: input.buildYear,
          createdById: userId,
          floor: input.floor,
          rooms: input.rooms,
          totalFloors: input.totalFloors,
          type: input.propertyType,
          address: {
            create: {
              detailAddress: input.detailAddress,
              eupmyeondong: input.eupmyeondong,
              latitude: coordinates?.latitude,
              longitude: coordinates?.longitude,
              postalCode: input.postalCode,
              roadAddress: input.roadAddress,
              sido: input.sido,
              sigungu: input.sigungu,
              visibility: input.addressVisibility,
            },
          },
        },
      });
      const listing = await transaction.listing.create({
        data: {
          ...price,
          agentId: agent.id,
          description: input.description,
          propertyId: property.id,
          status: ListingStatus.DRAFT,
          title: input.title,
          transactionType: input.transactionType,
        },
      });
      await transaction.listingHistory.create({
        data: {
          actorId: userId,
          changes: { version: listing.version },
          eventType: 'listing.created',
          listingId: listing.id,
          toStatus: ListingStatus.DRAFT,
        },
      });
      await transaction.listingPriceHistory.create({
        data: { ...price, changedById: userId, listingId: listing.id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.created',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { version: listing.version },
          resourceId: listing.id,
          resourceType: 'listing',
        },
      });
      const result = await transaction.listing.findUniqueOrThrow({
        include: MANAGED_LISTING_INCLUDE,
        where: { id: listing.id },
      });
      return this.toManagedDetail(result);
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateListingDto,
    context: RequestContext,
  ): Promise<ManagedListingDetail> {
    const agent = await this.activeAgent(userId);
    const current = await this.prisma.client.listing.findFirst({
      include: { property: { include: { address: true } } },
      where: { agentId: agent.id, deletedAt: null, id },
    });
    if (!current) throw new NotFoundException('Listing not found');
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        'Listing is not editable in its current status',
      );
    }
    const price = this.validatedPrice(input);
    this.validateFloors(input);
    const addressChanged =
      current.property.address?.roadAddress !== input.roadAddress ||
      (current.property.address?.postalCode ?? undefined) !== input.postalCode;
    const coordinates = addressChanged
      ? await this.geocoding.geocode({
          postalCode: input.postalCode,
          roadAddress: input.roadAddress,
        })
      : null;

    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: {
          ...price,
          description: input.description,
          title: input.title,
          transactionType: input.transactionType,
          version: { increment: 1 },
        },
        where: {
          agentId: agent.id,
          deletedAt: null,
          id,
          status: { in: EDITABLE_STATUSES },
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Listing changed since it was loaded. Reload and try again',
        );
      }
      await transaction.property.update({
        data: {
          areaSquareMeters: input.areaSquareMeters,
          bathrooms: input.bathrooms ?? null,
          buildYear: input.buildYear ?? null,
          floor: input.floor ?? null,
          rooms: input.rooms ?? null,
          totalFloors: input.totalFloors ?? null,
          type: input.propertyType,
          address: {
            update: {
              detailAddress: input.detailAddress ?? null,
              eupmyeondong: input.eupmyeondong,
              latitude: addressChanged
                ? (coordinates?.latitude ?? null)
                : undefined,
              longitude: addressChanged
                ? (coordinates?.longitude ?? null)
                : undefined,
              postalCode: input.postalCode ?? null,
              roadAddress: input.roadAddress,
              sido: input.sido,
              sigungu: input.sigungu,
              visibility: input.addressVisibility,
            },
          },
        },
        where: { id: current.propertyId },
      });
      await transaction.listingHistory.create({
        data: {
          actorId: userId,
          changes: { fromVersion: input.version, toVersion: input.version + 1 },
          eventType: 'listing.updated',
          listingId: id,
        },
      });
      await transaction.listingPriceHistory.create({
        data: { ...price, changedById: userId, listingId: id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.updated',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: {
            fromVersion: input.version,
            toVersion: input.version + 1,
          },
          resourceId: id,
          resourceType: 'listing',
        },
      });
      const result = await transaction.listing.findUniqueOrThrow({
        include: MANAGED_LISTING_INCLUDE,
        where: { id },
      });
      return this.toManagedDetail(result);
    });
  }

  async submitReview(
    userId: string,
    id: string,
    input: SubmitListingReviewDto,
    context: RequestContext,
  ): Promise<ManagedListingDetail> {
    const agent = await this.activeAgent(userId);
    const current = await this.prisma.client.listing.findFirst({
      where: { agentId: agent.id, deletedAt: null, id },
    });
    if (!current) throw new NotFoundException('Listing not found');
    if (!EDITABLE_STATUSES.includes(current.status)) {
      throw new ConflictException(
        'Listing cannot be submitted in its current status',
      );
    }
    const imageCount = await this.prisma.client.listingImage.count({
      where: { listingId: id, status: ListingImageStatus.READY },
    });
    if (imageCount === 0) {
      throw new BadRequestException(
        'At least one verified image is required before review',
      );
    }

    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: {
          status: ListingStatus.REVIEW_PENDING,
          version: { increment: 1 },
        },
        where: {
          agentId: agent.id,
          deletedAt: null,
          id,
          status: { in: EDITABLE_STATUSES },
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Listing changed. Reload and try again');
      }
      await transaction.listingHistory.create({
        data: {
          actorId: userId,
          changes: { fromVersion: input.version, toVersion: input.version + 1 },
          eventType: 'listing.review_submitted',
          fromStatus: current.status,
          listingId: id,
          toStatus: ListingStatus.REVIEW_PENDING,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.review_submitted',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { fromStatus: current.status },
          resourceId: id,
          resourceType: 'listing',
        },
      });
      const result = await transaction.listing.findUniqueOrThrow({
        include: MANAGED_LISTING_INCLUDE,
        where: { id },
      });
      return this.toManagedDetail(result);
    });
  }

  async reviewQueue(): Promise<ReviewQueueResponse> {
    const records = await this.prisma.client.listing.findMany({
      include: REVIEW_QUEUE_INCLUDE,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      where: { deletedAt: null, status: ListingStatus.REVIEW_PENDING },
    });
    return { items: records.map((record) => this.toReviewQueueItem(record)) };
  }

  async publicationQueue(): Promise<PublicationQueueResponse> {
    const records = await this.prisma.client.listing.findMany({
      include: REVIEW_QUEUE_INCLUDE,
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      where: { deletedAt: null, status: ListingStatus.APPROVED },
    });
    return { items: records.map((record) => this.toReviewQueueItem(record)) };
  }

  async publish(
    adminId: string,
    id: string,
    input: PublishListingDto,
    context: RequestContext,
  ): Promise<ReviewQueueListing> {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + input.durationDays * 24 * 60 * 60 * 1000,
    );
    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: {
          completedAt: null,
          expiresAt,
          publishedAt: now,
          status: ListingStatus.PUBLISHED,
          version: { increment: 1 },
        },
        where: {
          deletedAt: null,
          id,
          status: ListingStatus.APPROVED,
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Listing is not approved or has changed');
      }
      await this.recordTransition(transaction, {
        actorId: adminId,
        context,
        eventType: 'listing.published',
        fromStatus: ListingStatus.APPROVED,
        fromVersion: input.version,
        listingId: id,
        metadata: {
          durationDays: input.durationDays,
          expiresAt: expiresAt.toISOString(),
        },
        toStatus: ListingStatus.PUBLISHED,
      });
      await this.savedSearches.createMatchesForListing(transaction, id);
      const result = await transaction.listing.findUniqueOrThrow({
        include: REVIEW_QUEUE_INCLUDE,
        where: { id },
      });
      return this.toReviewQueueItem(result);
    });
  }

  async pause(
    userId: string,
    id: string,
    input: ListingVersionDto,
    context: RequestContext,
  ) {
    return this.transitionOwned(
      userId,
      id,
      input.version,
      [ListingStatus.PUBLISHED],
      ListingStatus.PAUSED,
      'listing.paused',
      context,
    );
  }

  async resume(
    userId: string,
    id: string,
    input: ListingVersionDto,
    context: RequestContext,
  ) {
    return this.transitionOwned(
      userId,
      id,
      input.version,
      [ListingStatus.PAUSED],
      ListingStatus.PUBLISHED,
      'listing.resumed',
      context,
      { expiresAt: { gt: new Date() } },
    );
  }

  async complete(
    userId: string,
    id: string,
    input: ListingVersionDto,
    context: RequestContext,
  ) {
    return this.transitionOwned(
      userId,
      id,
      input.version,
      [ListingStatus.PUBLISHED, ListingStatus.PAUSED],
      ListingStatus.COMPLETED,
      'listing.completed',
      context,
      {},
      { completedAt: new Date() },
    );
  }

  async review(
    adminId: string,
    id: string,
    input: ReviewListingDto,
    context: RequestContext,
  ): Promise<ReviewQueueListing> {
    if (input.decision !== ReviewDecision.APPROVED && !input.note) {
      throw new BadRequestException(
        'A review note is required for this decision',
      );
    }
    const targetStatus = {
      [ReviewDecision.APPROVED]: ListingStatus.APPROVED,
      [ReviewDecision.NEEDS_CHANGES]: ListingStatus.NEEDS_CHANGES,
      [ReviewDecision.REJECTED]: ListingStatus.REJECTED,
    }[input.decision];
    const current = await this.prisma.client.listing.findFirst({
      where: { deletedAt: null, id, status: ListingStatus.REVIEW_PENDING },
    });
    if (!current) throw new NotFoundException('Pending listing not found');

    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: { status: targetStatus, version: { increment: 1 } },
        where: {
          deletedAt: null,
          id,
          status: ListingStatus.REVIEW_PENDING,
          version: input.version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Listing was already reviewed or changed');
      }
      await transaction.listingReview.create({
        data: {
          decision: input.decision,
          listingId: id,
          note: input.note,
          reviewerId: adminId,
        },
      });
      await transaction.listingHistory.create({
        data: {
          actorId: adminId,
          changes: {
            decision: input.decision,
            fromVersion: input.version,
            note: input.note ?? null,
            toVersion: input.version + 1,
          },
          eventType: 'listing.review_decided',
          fromStatus: ListingStatus.REVIEW_PENDING,
          listingId: id,
          toStatus: targetStatus,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'listing.review_decided',
          actorId: adminId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { decision: input.decision },
          resourceId: id,
          resourceType: 'listing',
        },
      });
      const result = await transaction.listing.findUniqueOrThrow({
        include: REVIEW_QUEUE_INCLUDE,
        where: { id },
      });
      return this.toReviewQueueItem(result);
    });
  }

  private publicWhere(input: Partial<ListListingsDto> = {}) {
    const now = new Date();
    const priceRange = {
      ...(input.minPriceManwon
        ? { gte: BigInt(input.minPriceManwon) * 10_000n }
        : {}),
      ...(input.maxPriceManwon
        ? { lte: BigInt(input.maxPriceManwon) * 10_000n }
        : {}),
    };
    const hasPriceRange =
      input.minPriceManwon !== undefined || input.maxPriceManwon !== undefined;
    const priceConditions: Prisma.ListingWhereInput[] = hasPriceRange
      ? [
          ...(!input.transactionType || input.transactionType === 'SALE'
            ? [{ transactionType: 'SALE' as const, salePriceKrw: priceRange }]
            : []),
          ...(!input.transactionType || input.transactionType === 'JEONSE'
            ? [{ depositKrw: priceRange, transactionType: 'JEONSE' as const }]
            : []),
          ...(!input.transactionType || input.transactionType === 'MONTHLY_RENT'
            ? [
                {
                  monthlyRentKrw: priceRange,
                  transactionType: 'MONTHLY_RENT' as const,
                },
              ]
            : []),
        ]
      : [];

    return {
      agent: {
        is: {
          agency: {
            is: { deletedAt: null, status: AgencyStatus.ACTIVE },
          },
          status: AgentStatus.ACTIVE,
          user: { is: { deletedAt: null, status: UserStatus.ACTIVE } },
        },
      },
      deletedAt: null,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(priceConditions.length ? [{ OR: priceConditions }] : []),
      ],
      property: {
        is: {
          address: {
            is: {
              ...(input.sido ? { sido: input.sido } : {}),
              ...(input.sigungu ? { sigungu: input.sigungu } : {}),
            },
          },
          deletedAt: null,
          ...(input.minAreaSquareMeters || input.maxAreaSquareMeters
            ? {
                areaSquareMeters: {
                  ...(input.minAreaSquareMeters
                    ? { gte: input.minAreaSquareMeters }
                    : {}),
                  ...(input.maxAreaSquareMeters
                    ? { lte: input.maxAreaSquareMeters }
                    : {}),
                },
              }
            : {}),
          ...(input.propertyType ? { type: input.propertyType } : {}),
        },
      },
      publishedAt: { lte: now },
      status: ListingStatus.PUBLISHED,
      ...(input.transactionType
        ? { transactionType: input.transactionType }
        : {}),
    } satisfies Prisma.ListingWhereInput;
  }

  private validatePublicRanges(input: ListListingsDto): void {
    if (
      (input.sort === 'PRICE_ASC' || input.sort === 'PRICE_DESC') &&
      !input.transactionType
    ) {
      throw new BadRequestException(
        'Transaction type is required for price sorting',
      );
    }
    if (
      input.minPriceManwon &&
      input.maxPriceManwon &&
      BigInt(input.minPriceManwon) > BigInt(input.maxPriceManwon)
    ) {
      throw new BadRequestException(
        'Minimum price cannot exceed maximum price',
      );
    }
    if (
      input.minAreaSquareMeters &&
      input.maxAreaSquareMeters &&
      Number(input.minAreaSquareMeters) > Number(input.maxAreaSquareMeters)
    ) {
      throw new BadRequestException('Minimum area cannot exceed maximum area');
    }
  }

  private publicOrderBy(
    input: ListListingsDto,
  ): Prisma.ListingOrderByWithRelationInput[] {
    const direction =
      input.sort === 'PRICE_ASC' || input.sort === 'AREA_ASC' ? 'asc' : 'desc';
    if (input.sort === 'AREA_ASC' || input.sort === 'AREA_DESC') {
      return [{ property: { areaSquareMeters: direction } }, { id: direction }];
    }
    if (input.sort === 'PRICE_ASC' || input.sort === 'PRICE_DESC') {
      const priceField =
        input.transactionType === 'SALE'
          ? 'salePriceKrw'
          : input.transactionType === 'JEONSE'
            ? 'depositKrw'
            : 'monthlyRentKrw';
      return [{ [priceField]: direction }, { id: direction }];
    }
    return [{ publishedAt: 'desc' }, { id: 'desc' }];
  }

  private async transitionOwned(
    userId: string,
    id: string,
    version: number,
    fromStatuses: ListingStatus[],
    toStatus: ListingStatus,
    eventType: string,
    context: RequestContext,
    extraWhere: Prisma.ListingWhereInput = {},
    extraData: Prisma.ListingUpdateManyMutationInput = {},
  ): Promise<ManagedListingDetail> {
    const agent = await this.activeAgent(userId);
    const current = await this.prisma.client.listing.findFirst({
      where: { agentId: agent.id, deletedAt: null, id },
    });
    if (!current) throw new NotFoundException('Listing not found');
    if (!fromStatuses.includes(current.status)) {
      throw new ConflictException('Listing cannot make this transition');
    }
    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.listing.updateMany({
        data: { ...extraData, status: toStatus, version: { increment: 1 } },
        where: {
          ...extraWhere,
          agentId: agent.id,
          deletedAt: null,
          id,
          status: { in: fromStatuses },
          version,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'Listing changed or its publication expired',
        );
      }
      await this.recordTransition(transaction, {
        actorId: userId,
        context,
        eventType,
        fromStatus: current.status,
        fromVersion: version,
        listingId: id,
        toStatus,
      });
      const result = await transaction.listing.findUniqueOrThrow({
        include: MANAGED_LISTING_INCLUDE,
        where: { id },
      });
      return this.toManagedDetail(result);
    });
  }

  private async recordTransition(
    transaction: Prisma.TransactionClient,
    input: {
      actorId: string;
      context: RequestContext;
      eventType: string;
      fromStatus: ListingStatus;
      fromVersion: number;
      listingId: string;
      metadata?: Prisma.InputJsonObject;
      toStatus: ListingStatus;
    },
  ) {
    await transaction.listingHistory.create({
      data: {
        actorId: input.actorId,
        changes: {
          ...input.metadata,
          fromVersion: input.fromVersion,
          toVersion: input.fromVersion + 1,
        },
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        listingId: input.listingId,
        toStatus: input.toStatus,
      },
    });
    await transaction.auditLog.create({
      data: {
        action: input.eventType,
        actorId: input.actorId,
        ipHash: hmacRequestValue(input.context.ip),
        metadata: input.metadata,
        resourceId: input.listingId,
        resourceType: 'listing',
      },
    });
  }

  private async activeAgent(userId: string) {
    const agent = await this.prisma.client.agentProfile.findFirst({
      select: { agencyId: true, id: true },
      where: {
        agency: { is: { deletedAt: null, status: AgencyStatus.ACTIVE } },
        status: AgentStatus.ACTIVE,
        user: {
          is: { deletedAt: null, id: userId, status: UserStatus.ACTIVE },
        },
      },
    });
    if (!agent) throw new ForbiddenException('Active agent profile required');
    return agent;
  }

  private validateFloors(input: SaveListingDto) {
    if (
      input.floor !== undefined &&
      input.totalFloors !== undefined &&
      input.floor > input.totalFloors
    ) {
      throw new BadRequestException('Floor cannot exceed total floors');
    }
  }

  private validatedPrice(input: SaveListingDto) {
    const salePriceKrw = this.toBigInt(input.salePriceKrw);
    const depositKrw = this.toBigInt(input.depositKrw);
    const monthlyRentKrw = this.toBigInt(input.monthlyRentKrw);
    const maintenanceFeeKrw = this.toBigInt(input.maintenanceFeeKrw);

    if (
      (input.transactionType === 'SALE' &&
        (!salePriceKrw || depositKrw !== null || monthlyRentKrw !== null)) ||
      (input.transactionType === 'JEONSE' &&
        (!depositKrw || salePriceKrw !== null || monthlyRentKrw !== null)) ||
      (input.transactionType === 'MONTHLY_RENT' &&
        (depositKrw === null || !monthlyRentKrw || salePriceKrw !== null))
    ) {
      throw new BadRequestException(
        'Price fields do not match transaction type',
      );
    }
    return {
      depositKrw,
      maintenanceFeeKrw,
      monthlyRentKrw,
      salePriceKrw,
    };
  }

  private toBigInt(value?: string): bigint | null {
    return value === undefined ? null : BigInt(value);
  }

  private toManagedSummary(
    record: ManagedListingRecord,
  ): ManagedListingSummary {
    const address = record.property.address;
    if (!address) throw new Error(`Listing ${record.id} has no address`);
    return {
      completedAt: record.completedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      id: record.id,
      latestReviewNote: record.reviews[0]?.note ?? null,
      location: `${address.sido} ${address.sigungu} ${address.eupmyeondong}`,
      propertyType: record.property.type,
      publishedAt: record.publishedAt?.toISOString() ?? null,
      status: record.status,
      title: record.title,
      transactionType: record.transactionType,
      updatedAt: record.updatedAt.toISOString(),
      version: record.version,
    };
  }

  private toReviewQueueItem(record: ReviewQueueRecord): ReviewQueueListing {
    return {
      ...this.toManagedDetail(record),
      agency: {
        agentName: record.agent.user.displayName,
        name: record.agent.agency.name,
        registrationNumber: record.agent.registrationNumber,
      },
    };
  }

  private toManagedDetail(record: ManagedListingRecord): ManagedListingDetail {
    const address = record.property.address;
    if (!address) throw new Error(`Listing ${record.id} has no address`);
    return {
      ...this.toManagedSummary(record),
      address: {
        detailAddress: address.detailAddress,
        eupmyeondong: address.eupmyeondong,
        postalCode: address.postalCode,
        roadAddress: address.roadAddress,
        sido: address.sido,
        sigungu: address.sigungu,
        visibility: address.visibility,
      },
      description: record.description,
      images: record.images.map((image) => {
        const ready = image.status === ListingImageStatus.READY;
        return {
          contentPath: ready
            ? `/listings/mine/${record.id}/images/${image.id}/content`
            : null,
          height: image.height,
          id: image.id,
          mimeType: image.mimeType,
          rejectionReason: image.rejectionReason,
          sizeBytes: image.sizeBytes,
          sortOrder: image.sortOrder,
          status: image.status,
          thumbnailPath: ready
            ? `/listings/mine/${record.id}/images/${image.id}/thumbnail`
            : null,
          width: image.width,
        };
      }),
      price: {
        depositKrw: record.depositKrw?.toString() ?? null,
        maintenanceFeeKrw: record.maintenanceFeeKrw?.toString() ?? null,
        monthlyRentKrw: record.monthlyRentKrw?.toString() ?? null,
        salePriceKrw: record.salePriceKrw?.toString() ?? null,
      },
      property: {
        areaSquareMeters: record.property.areaSquareMeters.toString(),
        bathrooms: record.property.bathrooms,
        buildYear: record.property.buildYear,
        floor: record.property.floor,
        rooms: record.property.rooms,
        totalFloors: record.property.totalFloors,
        type: record.property.type,
      },
    };
  }

  private toSummary(record: PublicListingRecord): PublicListingSummary {
    const address = record.property.address;
    if (!address) {
      throw new Error(`Published listing ${record.id} has no address`);
    }

    return {
      agency: {
        agentName: record.agent.user.displayName,
        name: record.agent.agency.name,
        phone: record.agent.agency.phone,
        registrationNumber: record.agent.registrationNumber,
      },
      id: record.id,
      imageCount: record.images.length,
      primaryImagePath: record.images[0]
        ? `/listings/${record.id}/images/${record.images[0].id}/thumbnail`
        : null,
      location: {
        eupmyeondong: address.eupmyeondong,
        latitude: address.latitude ? Number(address.latitude) : null,
        longitude: address.longitude ? Number(address.longitude) : null,
        roadAddress:
          address.visibility === AddressVisibility.PUBLIC
            ? address.roadAddress
            : null,
        sido: address.sido,
        sigungu: address.sigungu,
      },
      price: {
        depositKrw: record.depositKrw?.toString() ?? null,
        maintenanceFeeKrw: record.maintenanceFeeKrw?.toString() ?? null,
        monthlyRentKrw: record.monthlyRentKrw?.toString() ?? null,
        salePriceKrw: record.salePriceKrw?.toString() ?? null,
      },
      property: {
        areaSquareMeters: record.property.areaSquareMeters.toString(),
        bathrooms: record.property.bathrooms,
        floor: record.property.floor,
        rooms: record.property.rooms,
        type: record.property.type,
      },
      publishedAt: record.publishedAt!.toISOString(),
      summary:
        record.description.length > 140
          ? `${record.description.slice(0, 137)}...`
          : record.description,
      title: record.title,
      transactionType: record.transactionType,
    };
  }
}
