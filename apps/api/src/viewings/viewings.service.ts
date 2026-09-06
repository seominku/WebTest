import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgencyStatus,
  AgentStatus,
  ListingStatus,
  UserStatus,
  ViewingProposalRole,
  ViewingProposalStatus,
  ViewingStatus,
} from '@real-estate/db';
import type {
  ViewingAppointmentSummary,
  ViewingAppointmentsResponse,
} from '@real-estate/shared';
import { hmacRequestValue } from '../auth/auth-security.js';
import type { RequestContext } from '../auth/auth.types.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import type {
  CreateViewingDto,
  ProposeViewingRescheduleDto,
  RespondViewingDto,
  RespondViewingRescheduleDto,
} from './dto/viewing.dto.js';

const VIEWING_INCLUDE = {
  listing: {
    select: { agent: { select: { userId: true } }, id: true, title: true },
  },
  rescheduleProposals: { orderBy: { createdAt: 'desc' }, take: 1 },
} as const;

const RECEIVED_INCLUDE = {
  ...VIEWING_INCLUDE,
  user: { select: { displayName: true } },
} as const;

@Injectable()
export class ViewingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    input: CreateViewingDto,
    context: RequestContext,
  ): Promise<ViewingAppointmentSummary> {
    const now = new Date();
    const requestedAt = new Date(input.requestedAt);
    if (requestedAt.getTime() < now.getTime() + 60 * 60 * 1000) {
      throw new BadRequestException(
        'Viewing must be requested at least 1 hour ahead',
      );
    }
    if (requestedAt.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Viewing can be requested up to 90 days ahead',
      );
    }
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
      throw new ForbiddenException(
        'Cannot request a viewing for your own listing',
      );
    }
    const duplicate = await this.prisma.client.viewingAppointment.findFirst({
      select: { id: true },
      where: {
        listingId: input.listingId,
        requestedAt,
        status: { in: [ViewingStatus.PENDING, ViewingStatus.CONFIRMED] },
        userId,
      },
    });
    if (duplicate)
      throw new ConflictException('Viewing request already exists');

    const record = await this.prisma.client.$transaction(
      async (transaction) => {
        const created = await transaction.viewingAppointment.create({
          data: {
            listingId: input.listingId,
            message: input.message,
            requestedAt,
            userId,
          },
          include: VIEWING_INCLUDE,
        });
        await transaction.auditLog.create({
          data: {
            action: 'viewing.requested',
            actorId: userId,
            ipHash: hmacRequestValue(context.ip),
            resourceId: created.id,
            resourceType: 'viewing',
          },
        });
        return created;
      },
    );
    return this.toSummary(record);
  }

  async findMine(userId: string): Promise<ViewingAppointmentsResponse> {
    const records = await this.prisma.client.viewingAppointment.findMany({
      include: VIEWING_INCLUDE,
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      where: { userId },
    });
    return { items: records.map((record) => this.toSummary(record)) };
  }

  async findReceived(userId: string): Promise<ViewingAppointmentsResponse> {
    await this.requireActiveAgent(userId);
    const records = await this.prisma.client.viewingAppointment.findMany({
      include: RECEIVED_INCLUDE,
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      where: { listing: { agent: { userId } } },
    });
    return {
      items: records.map((record) => ({
        ...this.toSummary(record),
        customer: { displayName: record.user.displayName },
      })),
    };
  }

  async respond(
    userId: string,
    id: string,
    input: RespondViewingDto,
    context: RequestContext,
  ): Promise<ViewingAppointmentSummary> {
    await this.requireActiveAgent(userId);
    const record = await this.prisma.client.viewingAppointment.findFirst({
      include: RECEIVED_INCLUDE,
      where: { id, listing: { agent: { userId } } },
    });
    if (!record) throw new NotFoundException('Viewing not found');
    if (record.status !== ViewingStatus.PENDING) {
      throw new ConflictException('Only pending viewings can be answered');
    }
    if (
      record.rescheduleProposals[0]?.status === ViewingProposalStatus.PENDING
    ) {
      throw new ConflictException(
        'Answer the pending reschedule proposal first',
      );
    }
    if (record.requestedAt <= new Date()) {
      throw new ConflictException('Past viewing cannot be answered');
    }
    const updated = await this.prisma.client.$transaction(
      async (transaction) => {
        const changed = await transaction.viewingAppointment.update({
          data: {
            respondedAt: new Date(),
            responseMessage: input.responseMessage,
            status: input.status,
          },
          include: RECEIVED_INCLUDE,
          where: { id },
        });
        await transaction.auditLog.create({
          data: {
            action: 'viewing.responded',
            actorId: userId,
            ipHash: hmacRequestValue(context.ip),
            metadata: { status: input.status },
            resourceId: id,
            resourceType: 'viewing',
          },
        });
        return changed;
      },
    );
    return {
      ...this.toSummary(updated),
      customer: { displayName: updated.user.displayName },
    };
  }

  async proposeReschedule(
    userId: string,
    id: string,
    input: ProposeViewingRescheduleDto,
    context: RequestContext,
  ): Promise<ViewingAppointmentSummary> {
    const { record, role } = await this.findForParticipant(userId, id);
    this.requireChangeableViewing(record);
    if (
      record.rescheduleProposals[0]?.status === ViewingProposalStatus.PENDING
    ) {
      throw new ConflictException('A reschedule proposal is already pending');
    }

    const proposedAt = new Date(input.proposedAt);
    this.requireValidFutureTime(proposedAt);
    if (proposedAt.getTime() === record.requestedAt.getTime()) {
      throw new BadRequestException('Proposed time must be different');
    }

    const duplicate = await this.prisma.client.viewingAppointment.findFirst({
      select: { id: true },
      where: {
        id: { not: id },
        listingId: record.listingId,
        requestedAt: proposedAt,
        status: { in: [ViewingStatus.PENDING, ViewingStatus.CONFIRMED] },
        userId: record.userId,
      },
    });
    if (duplicate) {
      throw new ConflictException(
        'Viewing request already exists at that time',
      );
    }

    await this.prisma.client.$transaction(async (transaction) => {
      await transaction.viewingRescheduleProposal.create({
        data: {
          message: input.message,
          proposedAt,
          proposedById: userId,
          proposedByRole: role,
          viewingAppointmentId: id,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'viewing.reschedule_proposed',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: {
            previousRequestedAt: record.requestedAt.toISOString(),
            proposedAt: proposedAt.toISOString(),
            proposedByRole: role,
          },
          resourceId: id,
          resourceType: 'viewing',
        },
      });
    });
    return this.findSummary(id);
  }

  async respondToReschedule(
    userId: string,
    id: string,
    input: RespondViewingRescheduleDto,
    context: RequestContext,
  ): Promise<ViewingAppointmentSummary> {
    const { record, role } = await this.findForParticipant(userId, id);
    this.requireChangeableViewing(record);
    const proposal = record.rescheduleProposals[0];
    if (!proposal || proposal.status !== ViewingProposalStatus.PENDING) {
      throw new ConflictException('No pending reschedule proposal');
    }
    this.requireValidFutureTime(proposal.proposedAt);
    if (proposal.proposedByRole === role) {
      throw new ForbiddenException('The proposer cannot answer this proposal');
    }

    await this.prisma.client.$transaction(async (transaction) => {
      const now = new Date();
      const proposalUpdate =
        await transaction.viewingRescheduleProposal.updateMany({
          data: {
            respondedAt: now,
            responseMessage: input.responseMessage,
            status: input.accepted
              ? ViewingProposalStatus.ACCEPTED
              : ViewingProposalStatus.DECLINED,
          },
          where: { id: proposal.id, status: ViewingProposalStatus.PENDING },
        });
      if (proposalUpdate.count !== 1) {
        throw new ConflictException('Reschedule proposal was already answered');
      }
      if (input.accepted) {
        await transaction.viewingAppointment.update({
          data: {
            requestedAt: proposal.proposedAt,
            respondedAt: now,
            status: ViewingStatus.CONFIRMED,
            ...(role === ViewingProposalRole.AGENT && input.responseMessage
              ? { responseMessage: input.responseMessage }
              : {}),
          },
          where: { id },
        });
      } else if (role === ViewingProposalRole.AGENT && input.responseMessage) {
        await transaction.viewingAppointment.update({
          data: {
            respondedAt: now,
            responseMessage: input.responseMessage,
          },
          where: { id },
        });
      }
      await transaction.auditLog.create({
        data: {
          action: input.accepted
            ? 'viewing.reschedule_accepted'
            : 'viewing.reschedule_declined',
          actorId: userId,
          ipHash: hmacRequestValue(context.ip),
          metadata: {
            proposedAt: proposal.proposedAt.toISOString(),
            responderRole: role,
          },
          resourceId: id,
          resourceType: 'viewing',
        },
      });
    });
    return this.findSummary(id);
  }

  async cancel(
    userId: string,
    id: string,
    context: RequestContext,
  ): Promise<ViewingAppointmentSummary> {
    const record = await this.prisma.client.viewingAppointment.findFirst({
      include: VIEWING_INCLUDE,
      where: { id, userId },
    });
    if (!record) throw new NotFoundException('Viewing not found');
    if (
      record.status !== ViewingStatus.PENDING &&
      record.status !== ViewingStatus.CONFIRMED
    ) {
      throw new ConflictException('Viewing cannot be cancelled');
    }
    if (record.requestedAt <= new Date()) {
      throw new ConflictException('Past viewing cannot be cancelled');
    }
    const updated = await this.prisma.client.$transaction(
      async (transaction) => {
        await transaction.viewingRescheduleProposal.updateMany({
          data: {
            respondedAt: new Date(),
            status: ViewingProposalStatus.CANCELLED,
          },
          where: {
            status: ViewingProposalStatus.PENDING,
            viewingAppointmentId: id,
          },
        });
        const changed = await transaction.viewingAppointment.update({
          data: { status: ViewingStatus.CANCELLED },
          include: VIEWING_INCLUDE,
          where: { id },
        });
        await transaction.auditLog.create({
          data: {
            action: 'viewing.cancelled',
            actorId: userId,
            ipHash: hmacRequestValue(context.ip),
            resourceId: id,
            resourceType: 'viewing',
          },
        });
        return changed;
      },
    );
    return this.toSummary(updated);
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

  private async findForParticipant(userId: string, id: string) {
    const record = await this.prisma.client.viewingAppointment.findUnique({
      include: RECEIVED_INCLUDE,
      where: { id },
    });
    if (!record) throw new NotFoundException('Viewing not found');
    if (record.userId === userId) {
      return { record, role: ViewingProposalRole.CUSTOMER };
    }
    if (record.listing.agent.userId === userId) {
      await this.requireActiveAgent(userId);
      return { record, role: ViewingProposalRole.AGENT };
    }
    throw new NotFoundException('Viewing not found');
  }

  private requireChangeableViewing(record: {
    requestedAt: Date;
    status: ViewingStatus;
  }) {
    if (
      record.status !== ViewingStatus.PENDING &&
      record.status !== ViewingStatus.CONFIRMED
    ) {
      throw new ConflictException('Viewing cannot be rescheduled');
    }
    if (record.requestedAt <= new Date()) {
      throw new ConflictException('Past viewing cannot be rescheduled');
    }
  }

  private requireValidFutureTime(value: Date) {
    const now = new Date();
    if (value.getTime() < now.getTime() + 60 * 60 * 1000) {
      throw new BadRequestException(
        'Viewing must be requested at least 1 hour ahead',
      );
    }
    if (value.getTime() > now.getTime() + 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(
        'Viewing can be requested up to 90 days ahead',
      );
    }
  }

  private async findSummary(id: string) {
    const record =
      await this.prisma.client.viewingAppointment.findUniqueOrThrow({
        include: VIEWING_INCLUDE,
        where: { id },
      });
    return this.toSummary(record);
  }

  private toSummary(record: {
    createdAt: Date;
    id: string;
    listing: { id: string; title: string };
    message: string | null;
    requestedAt: Date;
    respondedAt: Date | null;
    responseMessage: string | null;
    rescheduleProposals: Array<{
      createdAt: Date;
      id: string;
      message: string | null;
      proposedAt: Date;
      proposedByRole: ViewingProposalRole;
      respondedAt: Date | null;
      responseMessage: string | null;
      status: ViewingProposalStatus;
    }>;
    status: ViewingStatus;
    updatedAt: Date;
  }): ViewingAppointmentSummary {
    return {
      createdAt: record.createdAt.toISOString(),
      id: record.id,
      listing: record.listing,
      message: record.message,
      requestedAt: record.requestedAt.toISOString(),
      respondedAt: record.respondedAt?.toISOString() ?? null,
      responseMessage: record.responseMessage,
      rescheduleProposal: record.rescheduleProposals[0]
        ? {
            createdAt: record.rescheduleProposals[0].createdAt.toISOString(),
            id: record.rescheduleProposals[0].id,
            message: record.rescheduleProposals[0].message,
            proposedAt: record.rescheduleProposals[0].proposedAt.toISOString(),
            proposedByRole: record.rescheduleProposals[0].proposedByRole,
            respondedAt:
              record.rescheduleProposals[0].respondedAt?.toISOString() ?? null,
            responseMessage: record.rescheduleProposals[0].responseMessage,
            status: record.rescheduleProposals[0].status,
          }
        : null,
      status: record.status,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
