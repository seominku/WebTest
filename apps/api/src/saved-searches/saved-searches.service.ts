import {
  BadRequestException,
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
  UserStatus,
} from '@real-estate/db';
import type {
  PublicListingSummary,
  SavedSearchMatchesResponse,
  SavedSearchSummary,
  SavedSearchesResponse,
} from '@real-estate/shared';
import { hmacRequestValue } from '../auth/auth-security.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type { CreateSavedSearchDto } from './dto/saved-search.dto.js';
import type { PageQueryDto } from '../common/dto/page-query.dto.js';

const MAX_SAVED_SEARCHES = 20;

const MATCH_INCLUDE = {
  listing: {
    include: {
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
    },
  },
  savedSearch: { select: { id: true, name: true } },
} satisfies Prisma.SavedSearchMatchInclude;

type MatchRecord = Prisma.SavedSearchMatchGetPayload<{
  include: typeof MATCH_INCLUDE;
}>;

@Injectable()
export class SavedSearchesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateSavedSearchDto,
    context: RequestContext,
  ): Promise<SavedSearchSummary> {
    this.validateRanges(input);
    const count = await this.prisma.client.savedSearch.count({
      where: { userId },
    });
    if (count >= MAX_SAVED_SEARCHES) {
      throw new BadRequestException(
        `Saved searches are limited to ${MAX_SAVED_SEARCHES}`,
      );
    }

    const saved = await this.prisma.client.$transaction(async (transaction) => {
      const record = await transaction.savedSearch.create({
        data: {
          maxAreaSquareMeters: input.maxAreaSquareMeters,
          maxPriceManwon: input.maxPriceManwon
            ? BigInt(input.maxPriceManwon)
            : undefined,
          minAreaSquareMeters: input.minAreaSquareMeters,
          minPriceManwon: input.minPriceManwon
            ? BigInt(input.minPriceManwon)
            : undefined,
          name: input.name,
          propertyType: input.propertyType,
          sido: input.sido,
          sigungu: input.sigungu,
          sort: input.sort,
          transactionType: input.transactionType,
          userId,
        },
        include: { _count: { select: { matches: true } } },
      });
      await transaction.auditLog.create({
        data: {
          action: 'saved_search.created',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          resourceId: record.id,
          resourceType: 'saved_search',
        },
      });
      return record;
    });
    return this.toSummary(saved);
  }

  async findMine(userId: string): Promise<SavedSearchesResponse> {
    const records = await this.prisma.client.savedSearch.findMany({
      include: {
        _count: { select: { matches: { where: { viewedAt: null } } } },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      where: { userId },
    });
    return { items: records.map((record) => this.toSummary(record)) };
  }

  async remove(userId: string, id: string, context: RequestContext) {
    const record = await this.prisma.client.savedSearch.findFirst({
      select: { id: true },
      where: { id, userId },
    });
    if (!record) throw new NotFoundException('Saved search not found');
    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.savedSearch.delete({ where: { id } });
      await transaction.auditLog.create({
        data: {
          action: 'saved_search.deleted',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          resourceId: id,
          resourceType: 'saved_search',
        },
      });
    });
    return { deleted: true, id };
  }

  async createMatchesForListing(
    transaction: Prisma.TransactionClient,
    listingId: string,
  ): Promise<number> {
    const listing = await transaction.listing.findUniqueOrThrow({
      include: { property: { include: { address: true } } },
      where: { id: listingId },
    });
    const address = listing.property.address;
    if (!address) return 0;
    const priceKrw =
      listing.transactionType === 'SALE'
        ? listing.salePriceKrw
        : listing.transactionType === 'JEONSE'
          ? listing.depositKrw
          : listing.monthlyRentKrw;
    if (priceKrw === null) return 0;
    const priceManwon = priceKrw / 10_000n;
    const searches = await transaction.savedSearch.findMany({
      select: { id: true },
      where: {
        AND: [
          {
            OR: [
              { transactionType: null },
              { transactionType: listing.transactionType },
            ],
          },
          {
            OR: [
              { propertyType: null },
              { propertyType: listing.property.type },
            ],
          },
          { OR: [{ sido: null }, { sido: address.sido }] },
          { OR: [{ sigungu: null }, { sigungu: address.sigungu }] },
          {
            OR: [
              { minPriceManwon: null },
              { minPriceManwon: { lte: priceManwon } },
            ],
          },
          {
            OR: [
              { maxPriceManwon: null },
              { maxPriceManwon: { gte: priceManwon } },
            ],
          },
          {
            OR: [
              { minAreaSquareMeters: null },
              {
                minAreaSquareMeters: { lte: listing.property.areaSquareMeters },
              },
            ],
          },
          {
            OR: [
              { maxAreaSquareMeters: null },
              {
                maxAreaSquareMeters: { gte: listing.property.areaSquareMeters },
              },
            ],
          },
        ],
      },
    });
    if (!searches.length) return 0;
    const result = await transaction.savedSearchMatch.createMany({
      data: searches.map((search) => ({
        listingId,
        savedSearchId: search.id,
      })),
      skipDuplicates: true,
    });
    return result.count;
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.client.savedSearchMatch.count({
      where: {
        savedSearch: { userId },
        viewedAt: null,
      },
    });
    return { count };
  }

  async markMatchesViewed(userId: string, context: RequestContext) {
    const result = await this.prisma.client.savedSearchMatch.updateMany({
      data: { viewedAt: new Date() },
      where: { savedSearch: { userId }, viewedAt: null },
    });
    if (result.count) {
      await this.prisma.client.auditLog.create({
        data: {
          action: 'saved_search.matches_viewed',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: { count: result.count },
          resourceId: userId,
          resourceType: 'saved_search_notifications',
        },
      });
    }
    return { updated: result.count };
  }

  async findMatches(
    userId: string,
    query: PageQueryDto,
  ): Promise<SavedSearchMatchesResponse> {
    const now = new Date();
    const where = {
      listing: {
        agent: {
          is: {
            agency: { is: { deletedAt: null, status: AgencyStatus.ACTIVE } },
            status: AgentStatus.ACTIVE,
            user: { is: { deletedAt: null, status: UserStatus.ACTIVE } },
          },
        },
        deletedAt: null,
        expiresAt: { gt: now },
        publishedAt: { lte: now },
        status: ListingStatus.PUBLISHED,
      },
      savedSearch: { userId },
    } satisfies Prisma.SavedSearchMatchWhereInput;
    const [records, total] = await this.prisma.client.$transaction([
      this.prisma.client.savedSearchMatch.findMany({
        include: MATCH_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      this.prisma.client.savedSearchMatch.count({ where }),
    ]);
    return {
      items: records.map((record) => ({
        createdAt: record.createdAt.toISOString(),
        id: record.id,
        listing: this.toListingSummary(record),
        savedSearch: record.savedSearch,
        viewedAt: record.viewedAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  private validateRanges(input: CreateSavedSearchDto): void {
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

  private toSummary(record: {
    _count: { matches: number };
    createdAt: Date;
    id: string;
    maxAreaSquareMeters: Prisma.Decimal | null;
    maxPriceManwon: bigint | null;
    minAreaSquareMeters: Prisma.Decimal | null;
    minPriceManwon: bigint | null;
    name: string;
    propertyType: SavedSearchSummary['filters']['propertyType'];
    sido: string | null;
    sigungu: string | null;
    sort: string;
    transactionType: SavedSearchSummary['filters']['transactionType'];
    updatedAt: Date;
  }): SavedSearchSummary {
    return {
      createdAt: record.createdAt.toISOString(),
      filters: {
        maxAreaSquareMeters: record.maxAreaSquareMeters?.toString() ?? null,
        maxPriceManwon: record.maxPriceManwon?.toString() ?? null,
        minAreaSquareMeters: record.minAreaSquareMeters?.toString() ?? null,
        minPriceManwon: record.minPriceManwon?.toString() ?? null,
        propertyType: record.propertyType,
        sido: record.sido,
        sigungu: record.sigungu,
        sort: record.sort as SavedSearchSummary['filters']['sort'],
        transactionType: record.transactionType,
      },
      id: record.id,
      name: record.name,
      unreadMatchCount: record._count.matches,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toListingSummary(record: MatchRecord): PublicListingSummary {
    const listing = record.listing;
    const address = listing.property.address!;
    return {
      agency: {
        agentName: listing.agent.user.displayName,
        name: listing.agent.agency.name,
        phone: listing.agent.agency.phone,
        registrationNumber: listing.agent.registrationNumber,
      },
      id: listing.id,
      imageCount: listing.images.length,
      primaryImagePath: listing.images[0]
        ? `/listings/${listing.id}/images/${listing.images[0].id}/thumbnail`
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
        depositKrw: listing.depositKrw?.toString() ?? null,
        maintenanceFeeKrw: listing.maintenanceFeeKrw?.toString() ?? null,
        monthlyRentKrw: listing.monthlyRentKrw?.toString() ?? null,
        salePriceKrw: listing.salePriceKrw?.toString() ?? null,
      },
      property: {
        areaSquareMeters: listing.property.areaSquareMeters.toString(),
        bathrooms: listing.property.bathrooms,
        floor: listing.property.floor,
        rooms: listing.property.rooms,
        type: listing.property.type,
      },
      publishedAt: listing.publishedAt!.toISOString(),
      summary:
        listing.description.length > 140
          ? `${listing.description.slice(0, 137)}...`
          : listing.description,
      title: listing.title,
      transactionType: listing.transactionType,
    };
  }
}
