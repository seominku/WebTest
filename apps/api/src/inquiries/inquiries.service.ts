import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgencyStatus,
  AgentStatus,
  InquiryStatus,
  ListingStatus,
  UserStatus,
} from '@real-estate/db';
import type {
  InquiriesResponse,
  InquirySummary,
  ReceivedInquiriesResponse,
  ReceivedInquirySummary,
} from '@real-estate/shared';
import { hmacRequestValue } from '../auth/auth-security.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type { PageQueryDto } from '../common/dto/page-query.dto.js';
import type { CreateInquiryDto, RespondInquiryDto } from './dto/inquiry.dto.js';

const INQUIRY_INCLUDE = {
  listing: { select: { id: true, title: true } },
} as const;

const RECEIVED_INQUIRY_INCLUDE = {
  ...INQUIRY_INCLUDE,
  user: { select: { displayName: true } },
} as const;

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateInquiryDto,
    context: RequestContext,
  ): Promise<InquirySummary> {
    const now = new Date();
    const listing = await this.prisma.client.listing.findFirst({
      select: { agent: { select: { userId: true } }, id: true },
      where: {
        agent: {
          is: {
            agency: { is: { deletedAt: null, status: AgencyStatus.ACTIVE } },
            status: AgentStatus.ACTIVE,
            user: { is: { deletedAt: null, status: UserStatus.ACTIVE } },
          },
        },
        deletedAt: null,
        id: input.listingId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        publishedAt: { lte: now },
        status: ListingStatus.PUBLISHED,
      },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.agent.userId === userId) {
      throw new ForbiddenException('Cannot inquire about your own listing');
    }

    return this.prisma.client.$transaction(async (transaction) => {
      const inquiry = await transaction.inquiry.create({
        data: {
          listingId: input.listingId,
          message: input.message,
          userId,
        },
        include: INQUIRY_INCLUDE,
      });
      await transaction.auditLog.create({
        data: {
          action: 'inquiry.created',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          resourceId: inquiry.id,
          resourceType: 'inquiry',
        },
      });
      return this.toSummary(inquiry);
    });
  }

  async findMine(
    userId: string,
    query: PageQueryDto,
  ): Promise<InquiriesResponse> {
    const where = { userId };
    const [inquiries, total] = await this.prisma.client.$transaction([
      this.prisma.client.inquiry.findMany({
        include: INQUIRY_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      this.prisma.client.inquiry.count({ where }),
    ]);
    return {
      items: inquiries.map((inquiry) => this.toSummary(inquiry)),
      pagination: this.pagination(query, total),
    };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.client.inquiry.count({
      where: {
        responseViewedAt: null,
        status: InquiryStatus.RESPONDED,
        userId,
      },
    });
    return { count };
  }

  async markResponsesViewed(userId: string, context: RequestContext) {
    return this.prisma.client.$transaction(async (transaction) => {
      const result = await transaction.inquiry.updateMany({
        data: { responseViewedAt: new Date() },
        where: {
          responseViewedAt: null,
          status: InquiryStatus.RESPONDED,
          userId,
        },
      });
      if (result.count > 0) {
        await transaction.auditLog.create({
          data: {
            action: 'inquiry.responses_viewed',
            actorId: userId,
            ipHash: hmacRequestValue(context.ip),
            metadata: { count: result.count },
            resourceId: userId,
            resourceType: 'inquiry_notifications',
          },
        });
      }
      return { updated: result.count };
    });
  }

  async findReceived(
    userId: string,
    query: PageQueryDto,
  ): Promise<ReceivedInquiriesResponse> {
    await this.requireActiveAgent(userId);
    const where = { listing: { agent: { userId } } };
    const [inquiries, total] = await this.prisma.client.$transaction([
      this.prisma.client.inquiry.findMany({
        include: RECEIVED_INQUIRY_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      this.prisma.client.inquiry.count({ where }),
    ]);
    return {
      items: inquiries.map((inquiry) => ({
        ...this.toSummary(inquiry),
        customer: { displayName: inquiry.user.displayName },
      })),
      pagination: this.pagination(query, total),
    };
  }

  async respond(
    userId: string,
    id: string,
    input: RespondInquiryDto,
    context: RequestContext,
  ): Promise<ReceivedInquirySummary> {
    await this.requireActiveAgent(userId);
    const inquiry = await this.prisma.client.inquiry.findFirst({
      include: RECEIVED_INQUIRY_INCLUDE,
      where: { id, listing: { agent: { userId } } },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    if (inquiry.status === InquiryStatus.CLOSED) {
      throw new ConflictException('Closed inquiry cannot be answered');
    }

    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.inquiry.update({
        data: {
          respondedAt: new Date(),
          responseMessage: input.responseMessage,
          responseViewedAt: null,
          status: InquiryStatus.RESPONDED,
        },
        include: RECEIVED_INQUIRY_INCLUDE,
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'inquiry.responded',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          resourceId: id,
          resourceType: 'inquiry',
        },
      });
      return {
        ...this.toSummary(updated),
        customer: { displayName: updated.user.displayName },
      };
    });
  }

  async close(
    userId: string,
    id: string,
    context: RequestContext,
  ): Promise<InquirySummary> {
    const inquiry = await this.prisma.client.inquiry.findFirst({
      include: INQUIRY_INCLUDE,
      where: {
        id,
        OR: [{ userId }, { listing: { agent: { userId } } }],
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    if (inquiry.status === InquiryStatus.CLOSED) return this.toSummary(inquiry);

    return this.prisma.client.$transaction(async (transaction) => {
      const updated = await transaction.inquiry.update({
        data: { closedAt: new Date(), status: InquiryStatus.CLOSED },
        include: INQUIRY_INCLUDE,
        where: { id },
      });
      await transaction.auditLog.create({
        data: {
          action: 'inquiry.closed',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          resourceId: id,
          resourceType: 'inquiry',
        },
      });
      return this.toSummary(updated);
    });
  }

  private async requireActiveAgent(userId: string) {
    const agent = await this.prisma.client.agentProfile.findFirst({
      select: { id: true },
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

  private pagination(query: PageQueryDto, total: number) {
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  private toSummary(inquiry: {
    createdAt: Date;
    id: string;
    listing: { id: string; title: string };
    message: string;
    respondedAt: Date | null;
    responseMessage: string | null;
    responseViewedAt: Date | null;
    status: InquiryStatus;
    updatedAt: Date;
  }): InquirySummary {
    return {
      createdAt: inquiry.createdAt.toISOString(),
      id: inquiry.id,
      listing: inquiry.listing,
      message: inquiry.message,
      respondedAt: inquiry.respondedAt?.toISOString() ?? null,
      responseMessage: inquiry.responseMessage,
      responseViewedAt: inquiry.responseViewedAt?.toISOString() ?? null,
      status: inquiry.status,
      updatedAt: inquiry.updatedAt.toISOString(),
    };
  }
}
