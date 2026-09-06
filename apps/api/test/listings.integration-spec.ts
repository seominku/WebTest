import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AgencyStatus,
  AgentStatus,
  UserRole,
  UserStatus,
} from '@real-estate/db';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { loadLocalEnvironment } from '../src/config/environment.js';
import { configureApp } from '../src/configure-app.js';
import { ClamAvScannerService } from '../src/infrastructure/clamav-scanner.service.js';
import { PrismaService } from '../src/infrastructure/prisma.service.js';
import { ObjectStorageService } from '../src/infrastructure/object-storage.service.js';
import { ListingExpirationService } from '../src/listings/listing-expiration.service.js';
import { ListingImageProcessingService } from '../src/listings/listing-image-processing.service.js';

describe('Agent listing management (integration)', () => {
  let app: INestApplication;
  let clamav: ClamAvScannerService;
  let prisma: PrismaService;
  let expiration: ListingExpirationService;
  let imageProcessor: ListingImageProcessingService;
  let storage: ObjectStorageService;
  let agencyId: string | undefined;
  const userIds: string[] = [];
  const inquiryIds: string[] = [];
  const viewingIds: string[] = [];
  const listingIds: string[] = [];
  const propertyIds: string[] = [];
  const origin = 'http://localhost:3000';
  const password = 'StrongAgentPassword123!';
  const testIp = `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}::1`;

  beforeAll(async () => {
    loadLocalEnvironment();
    process.env.APP_ENV = 'test';
    process.env.TRUST_PROXY_HOPS = '1';
    process.env.WEB_ORIGIN = origin;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    clamav = app.get(ClamAvScannerService);
    prisma = app.get(PrismaService);
    expiration = app.get(ListingExpirationService);
    imageProcessor = app.get(ListingImageProcessingService);
    storage = app.get(ObjectStorageService);
  });

  async function waitForImageStatus(imageId: string, expected: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await imageProcessor.processDueImages();
      const image = await prisma.client.listingImage.findUniqueOrThrow({
        where: { id: imageId },
      });
      if (image.status === expected) return image;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Image ${imageId} did not reach ${expected}`);
  }

  it('enforces ownership, draft visibility, history, and optimistic locking', async () => {
    const agency = await prisma.client.agency.create({
      data: {
        licenseNumber: `TEST-${randomUUID()}`,
        name: '통합 테스트 중개사무소',
        phone: '02-0000-0000',
        status: AgencyStatus.ACTIVE,
      },
    });
    agencyId = agency.id;
    const passwordHash = await hash(password);
    const users = await Promise.all(
      ['소유 중개사', '다른 중개사'].map(async (displayName, index) => {
        const user = await prisma.client.user.create({
          data: {
            displayName,
            email: `listing-${index}-${randomUUID()}@example.test`,
            emailVerifiedAt: new Date(),
            passwordHash,
            role: UserRole.AGENT,
            status: UserStatus.ACTIVE,
          },
        });
        userIds.push(user.id);
        await prisma.client.agentProfile.create({
          data: {
            agencyId: agency.id,
            registrationNumber: `TEST-AGENT-${randomUUID()}`,
            status: AgentStatus.ACTIVE,
            userId: user.id,
          },
        });
        return user;
      }),
    );
    const adminUser = await prisma.client.user.create({
      data: {
        displayName: '검수 관리자',
        email: `listing-admin-${randomUUID()}@example.test`,
        emailVerifiedAt: new Date(),
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    userIds.push(adminUser.id);

    const owner = request.agent(app.getHttpServer());
    const outsider = request.agent(app.getHttpServer());
    const admin = request.agent(app.getHttpServer());
    const ownerUser = users[0]!;
    const outsiderUser = users[1]!;
    const ownerLogin = await owner
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email: ownerUser.email, password })
      .expect(200);
    const outsiderLogin = await outsider
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email: outsiderUser.email, password })
      .expect(200);
    const adminLogin = await admin
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .set('X-Forwarded-For', testIp)
      .send({ email: adminUser.email, password })
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/v1/saved-searches')
      .expect(401);
    const savedSearch = await outsider
      .post('/api/v1/saved-searches')
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({
        maxAreaSquareMeters: '100',
        maxPriceManwon: '200',
        minAreaSquareMeters: '70',
        minPriceManwon: '100',
        name: '성동구 월세 아파트',
        propertyType: 'APARTMENT',
        sido: '서울특별시',
        sigungu: '성동구',
        sort: 'PRICE_ASC',
        transactionType: 'MONTHLY_RENT',
      })
      .expect(201);
    expect(savedSearch.body).toMatchObject({
      name: '성동구 월세 아파트',
      unreadMatchCount: 0,
    });
    await outsider
      .get('/api/v1/saved-searches')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          savedSearch.body.id,
        ),
      );

    const input = {
      addressVisibility: 'APPROXIMATE',
      areaSquareMeters: '84.92',
      bathrooms: 2,
      buildYear: 2024,
      depositKrw: '30000000',
      description:
        '소유권과 동시 수정 방지를 검증하기 위한 통합 테스트용 가상 매물입니다.',
      eupmyeondong: '성수동1가',
      floor: 8,
      maintenanceFeeKrw: '180000',
      monthlyRentKrw: '1500000',
      propertyType: 'APARTMENT',
      roadAddress: '서울특별시 성동구 테스트로 10',
      rooms: 3,
      sido: '서울특별시',
      sigungu: '성동구',
      title: '통합 테스트 월세 아파트',
      totalFloors: 20,
      transactionType: 'MONTHLY_RENT',
    };
    const created = await owner
      .post('/api/v1/listings')
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send(input)
      .expect(201);
    listingIds.push(created.body.id);
    expect(created.body).toMatchObject({ status: 'DRAFT', version: 1 });
    const stored = await prisma.client.listing.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    propertyIds.push(stored.propertyId);

    const firstImage = await sharp({
      create: {
        background: { b: 40, g: 120, r: 220 },
        channels: 3,
        height: 600,
        width: 800,
      },
    })
      .png()
      .toBuffer();
    const secondImage = await sharp({
      create: {
        background: { b: 90, g: 180, r: 40 },
        channels: 3,
        height: 720,
        width: 960,
      },
    })
      .png()
      .toBuffer();
    const firstUpload = await owner
      .post(`/api/v1/listings/mine/${created.body.id}/images`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .field('version', '1')
      .attach('image', firstImage, {
        contentType: 'image/png',
        filename: 'first.png',
      })
      .expect(201);
    expect(firstUpload.body).toMatchObject({
      image: {
        height: null,
        mimeType: 'image/png',
        sortOrder: 0,
        status: 'UPLOADED',
        width: null,
      },
      version: 2,
    });
    await owner
      .get(
        `/api/v1/listings/mine/${created.body.id}/images/${firstUpload.body.image.id}/content`,
      )
      .expect(404);
    const firstReady = await waitForImageStatus(
      firstUpload.body.image.id,
      'READY',
    );
    expect(firstReady).toMatchObject({
      height: 600,
      mimeType: 'image/webp',
      width: 800,
    });
    expect(firstReady.thumbnailObjectKey).toEqual(expect.any(String));
    await owner
      .get(
        `/api/v1/listings/mine/${created.body.id}/images/${firstUpload.body.image.id}/content`,
      )
      .expect('Content-Type', /image\/webp/)
      .expect(200);
    await owner
      .get(
        `/api/v1/listings/mine/${created.body.id}/images/${firstUpload.body.image.id}/thumbnail`,
      )
      .expect('Content-Type', /image\/webp/)
      .expect(200);
    await outsider
      .get(
        `/api/v1/listings/mine/${created.body.id}/images/${firstUpload.body.image.id}/content`,
      )
      .expect(404);
    await owner
      .post(`/api/v1/listings/mine/${created.body.id}/images`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .field('version', '2')
      .attach('image', firstImage, {
        contentType: 'image/png',
        filename: 'duplicate.png',
      })
      .expect(409);
    const eicar = Buffer.from(
      'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
    );
    await expect(clamav.scan(eicar)).rejects.toThrow(/Malware detected/u);
    const tooSmall = await sharp({
      create: {
        background: { b: 0, g: 0, r: 0 },
        channels: 3,
        height: 100,
        width: 100,
      },
    })
      .png()
      .toBuffer();
    const rejectedUpload = await owner
      .post(`/api/v1/listings/mine/${created.body.id}/images`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .field('version', '2')
      .attach('image', tooSmall, {
        contentType: 'image/png',
        filename: 'small.png',
      })
      .expect(201);
    const rejected = await waitForImageStatus(
      rejectedUpload.body.image.id,
      'REJECTED',
    );
    expect(rejected.rejectionReason).toMatch(/at least 640 × 480/u);
    await owner
      .delete(
        `/api/v1/listings/mine/${created.body.id}/images/${rejectedUpload.body.image.id}`,
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 3 })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(4));
    const secondUpload = await owner
      .post(`/api/v1/listings/mine/${created.body.id}/images`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .field('version', '4')
      .attach('image', secondImage, {
        contentType: 'image/png',
        filename: 'second.png',
      })
      .expect(201);
    expect(secondUpload.body).toMatchObject({
      image: { status: 'UPLOADED' },
      version: 5,
    });
    await waitForImageStatus(secondUpload.body.image.id, 'READY');
    await owner
      .put(`/api/v1/listings/mine/${created.body.id}/images/order`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        imageIds: [secondUpload.body.image.id, firstUpload.body.image.id],
        version: 5,
      })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(6));
    await owner
      .delete(
        `/api/v1/listings/mine/${created.body.id}/images/${firstUpload.body.image.id}`,
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 6 })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(7));
    await request(app.getHttpServer())
      .get(
        `/api/v1/listings/${created.body.id}/images/${secondUpload.body.image.id}/content`,
      )
      .expect(404);

    await owner
      .get('/api/v1/listings/mine')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          created.body.id,
        ),
      );
    await outsider.get(`/api/v1/listings/mine/${created.body.id}`).expect(404);
    await outsider
      .put(`/api/v1/listings/${created.body.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({ ...input, version: 1 })
      .expect(404);

    const updated = await owner
      .put(`/api/v1/listings/${created.body.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ ...input, title: '수정된 통합 테스트 월세 아파트', version: 7 })
      .expect(200);
    expect(updated.body).toMatchObject({
      title: '수정된 통합 테스트 월세 아파트',
      version: 8,
    });

    await owner
      .put(`/api/v1/listings/${created.body.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ ...input, version: 7 })
      .expect(409);
    await outsider.get('/api/v1/listings/review-queue').expect(403);

    const submitted = await owner
      .post(`/api/v1/listings/${created.body.id}/submit-review`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 8 })
      .expect(201);
    expect(submitted.body).toMatchObject({
      status: 'REVIEW_PENDING',
      version: 9,
    });
    await admin
      .get('/api/v1/listings/review-queue')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          created.body.id,
        ),
      );
    await admin
      .post(`/api/v1/listings/${created.body.id}/review`)
      .set('Origin', origin)
      .set('X-CSRF-Token', adminLogin.body.csrfToken)
      .send({ decision: 'NEEDS_CHANGES', version: 9 })
      .expect(400);
    const needsChanges = await admin
      .post(`/api/v1/listings/${created.body.id}/review`)
      .set('Origin', origin)
      .set('X-CSRF-Token', adminLogin.body.csrfToken)
      .send({
        decision: 'NEEDS_CHANGES',
        note: '도로명 주소의 건물 번호를 다시 확인해 주세요.',
        version: 9,
      })
      .expect(201);
    expect(needsChanges.body).toMatchObject({
      latestReviewNote: '도로명 주소의 건물 번호를 다시 확인해 주세요.',
      status: 'NEEDS_CHANGES',
      version: 10,
    });

    const corrected = await owner
      .put(`/api/v1/listings/${created.body.id}`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        ...input,
        roadAddress: '서울특별시 성동구 테스트로 12',
        version: 10,
      })
      .expect(200);
    expect(corrected.body.version).toBe(11);
    await owner
      .post(`/api/v1/listings/${created.body.id}/submit-review`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 11 })
      .expect(201);
    const approved = await admin
      .post(`/api/v1/listings/${created.body.id}/review`)
      .set('Origin', origin)
      .set('X-CSRF-Token', adminLogin.body.csrfToken)
      .send({ decision: 'APPROVED', note: '확인 완료', version: 12 })
      .expect(201);
    expect(approved.body).toMatchObject({ status: 'APPROVED', version: 13 });
    await owner
      .post(`/api/v1/listings/${created.body.id}/publish`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ durationDays: 30, version: 13 })
      .expect(403);
    await admin
      .get('/api/v1/listings/publication-queue')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          created.body.id,
        ),
      );
    const published = await admin
      .post(`/api/v1/listings/${created.body.id}/publish`)
      .set('Origin', origin)
      .set('X-CSRF-Token', adminLogin.body.csrfToken)
      .send({ durationDays: 30, version: 13 })
      .expect(201);
    expect(published.body).toMatchObject({ status: 'PUBLISHED', version: 14 });
    expect(new Date(published.body.expiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    await outsider
      .get('/api/v1/saved-searches/unread-count')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ count: 1 }));
    await outsider
      .get('/api/v1/saved-searches/matches')
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          items: [
            {
              listing: { id: created.body.id },
              savedSearch: { id: savedSearch.body.id },
              viewedAt: null,
            },
          ],
          pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
        }),
      );
    await outsider.get('/api/v1/saved-searches/matches?page=0').expect(400);
    await outsider
      .post('/api/v1/saved-searches/matches/viewed')
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ updated: 1 }));
    const publicDetail = await request(app.getHttpServer())
      .get(`/api/v1/listings/${created.body.id}`)
      .expect(200);
    expect(publicDetail.body).toMatchObject({
      imageCount: 1,
      imagePaths: [
        `/listings/${created.body.id}/images/${secondUpload.body.image.id}/content`,
      ],
      primaryImagePath: `/listings/${created.body.id}/images/${secondUpload.body.image.id}/thumbnail`,
    });
    await request(app.getHttpServer())
      .get(`/api/v1${publicDetail.body.primaryImagePath}`)
      .expect('Content-Type', /image\/webp/)
      .expect(200);

    await request(app.getHttpServer()).get('/api/v1/viewings/mine').expect(401);
    const requestedAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await owner
      .post('/api/v1/viewings')
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        listingId: created.body.id,
        requestedAt: requestedAt.toISOString(),
      })
      .expect(403);
    const viewing = await outsider
      .post('/api/v1/viewings')
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({
        listingId: created.body.id,
        message: '주차 공간도 함께 확인하고 싶습니다.',
        requestedAt: requestedAt.toISOString(),
      })
      .expect(201);
    viewingIds.push(viewing.body.id);
    expect(viewing.body).toMatchObject({ status: 'PENDING' });
    await owner
      .get('/api/v1/viewings/received')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items[0]).toMatchObject({
          customer: { displayName: '다른 중개사' },
          id: viewing.body.id,
        }),
      );
    const agentProposedAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await owner
      .post(`/api/v1/viewings/${viewing.body.id}/reschedule-proposals`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        message: '오후 시간으로 변경을 제안합니다.',
        proposedAt: agentProposedAt.toISOString(),
      })
      .expect(201)
      .expect(({ body }) =>
        expect(body.rescheduleProposal).toMatchObject({
          proposedByRole: 'AGENT',
          status: 'PENDING',
        }),
      );
    await owner
      .put(`/api/v1/viewings/${viewing.body.id}/reschedule-proposals/respond`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ accepted: true })
      .expect(403);
    await outsider
      .put(`/api/v1/viewings/${viewing.body.id}/reschedule-proposals/respond`)
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({ accepted: true })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          requestedAt: agentProposedAt.toISOString(),
          status: 'CONFIRMED',
          rescheduleProposal: { status: 'ACCEPTED' },
        }),
      );
    const customerProposedAt = new Date(Date.now() + 96 * 60 * 60 * 1000);
    await outsider
      .post(`/api/v1/viewings/${viewing.body.id}/reschedule-proposals`)
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({ proposedAt: customerProposedAt.toISOString() })
      .expect(201);
    await owner
      .put(`/api/v1/viewings/${viewing.body.id}/reschedule-proposals/respond`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        accepted: false,
        responseMessage: '기존 일정으로 진행해 주세요.',
      })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          requestedAt: agentProposedAt.toISOString(),
          status: 'CONFIRMED',
          rescheduleProposal: { status: 'DECLINED' },
        }),
      );
    await outsider
      .post(`/api/v1/viewings/${viewing.body.id}/cancel`)
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({})
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'CANCELLED' }),
      );

    await request(app.getHttpServer())
      .get('/api/v1/listings/favorites')
      .expect(401);
    await owner
      .post(`/api/v1/listings/${created.body.id}/favorite`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ favorite: true }));
    await owner
      .post(`/api/v1/listings/${created.body.id}/favorite`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({})
      .expect(201);
    await owner
      .get('/api/v1/listings/favorites')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          created.body.id,
        ),
      );
    await owner
      .delete(`/api/v1/listings/${created.body.id}/favorite`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({})
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ favorite: false }));

    await request(app.getHttpServer())
      .get('/api/v1/inquiries/mine')
      .expect(401);
    await owner
      .post('/api/v1/inquiries')
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({
        listingId: created.body.id,
        message: '내 매물에는 직접 문의할 수 없어야 합니다.',
      })
      .expect(403);
    const createdInquiry = await outsider
      .post('/api/v1/inquiries')
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({
        listingId: created.body.id,
        message: '다음 주 토요일에 방문 상담이 가능한가요?',
      })
      .expect(201);
    inquiryIds.push(createdInquiry.body.id);
    expect(createdInquiry.body).toMatchObject({
      listing: { id: created.body.id },
      responseMessage: null,
      status: 'OPEN',
    });
    await outsider
      .get('/api/v1/inquiries/mine')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          pagination: { page: 1, pageSize: 10, totalPages: 1 },
        });
        expect(body.items.map((item: { id: string }) => item.id)).toContain(
          createdInquiry.body.id,
        );
      });
    await outsider.get('/api/v1/inquiries/mine?page=0').expect(400);
    await outsider.get('/api/v1/inquiries/received').expect(200);
    await owner
      .get('/api/v1/inquiries/received')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items[0]).toMatchObject({
          customer: { displayName: '다른 중개사' },
          id: createdInquiry.body.id,
          status: 'OPEN',
        }),
      );
    await owner
      .put(`/api/v1/inquiries/${createdInquiry.body.id}/respond`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ responseMessage: '토요일 오후 2시에 방문하실 수 있습니다.' })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          responseMessage: '토요일 오후 2시에 방문하실 수 있습니다.',
          status: 'RESPONDED',
        }),
      );
    await outsider
      .get('/api/v1/inquiries/mine')
      .expect(200)
      .expect(({ body }) =>
        expect(body.items[0]).toMatchObject({
          id: createdInquiry.body.id,
          responseViewedAt: null,
          status: 'RESPONDED',
        }),
      );
    await outsider
      .get('/api/v1/inquiries/unread-count')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ count: 1 }));
    await outsider
      .post('/api/v1/inquiries/responses/viewed')
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body).toEqual({ updated: 1 }));
    await outsider
      .get('/api/v1/inquiries/unread-count')
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ count: 0 }));
    await outsider
      .post(`/api/v1/inquiries/${createdInquiry.body.id}/close`)
      .set('Origin', origin)
      .set('X-CSRF-Token', outsiderLogin.body.csrfToken)
      .send({})
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'CLOSED' }));
    await owner
      .put(`/api/v1/inquiries/${createdInquiry.body.id}/respond`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ responseMessage: '종료된 문의에는 답변할 수 없습니다.' })
      .expect(409);

    await owner
      .post(`/api/v1/listings/${created.body.id}/pause`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 14 })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'PAUSED', version: 15 }),
      );
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${created.body.id}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1${publicDetail.body.primaryImagePath}`)
      .expect(404);
    await owner
      .post(`/api/v1/listings/${created.body.id}/resume`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 15 })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ status: 'PUBLISHED', version: 16 }),
      );
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${created.body.id}`)
      .expect(200);
    await owner
      .post(`/api/v1/listings/${created.body.id}/complete`)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerLogin.body.csrfToken)
      .send({ version: 16 })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'COMPLETED', version: 17 });
        expect(body.completedAt).toEqual(expect.any(String));
      });

    await prisma.client.listing.update({
      data: { completedAt: null, status: 'APPROVED' },
      where: { id: created.body.id },
    });
    await admin
      .post(`/api/v1/listings/${created.body.id}/publish`)
      .set('Origin', origin)
      .set('X-CSRF-Token', adminLogin.body.csrfToken)
      .send({ durationDays: 1, version: 17 })
      .expect(201);
    await prisma.client.listing.update({
      data: {
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        publishedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      where: { id: created.body.id },
    });
    expect(await expiration.expireDueListings()).toBe(1);
    const expired = await prisma.client.listing.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(expired).toMatchObject({ status: 'EXPIRED', version: 19 });
    await request(app.getHttpServer())
      .get(`/api/v1/listings/${created.body.id}`)
      .expect(404);

    expect(
      await prisma.client.listingHistory.count({
        where: { listingId: created.body.id },
      }),
    ).toBe(22);
    expect(
      await prisma.client.listingPriceHistory.count({
        where: { listingId: created.body.id },
      }),
    ).toBe(3);
    expect(
      await prisma.client.auditLog.count({
        where: { resourceId: created.body.id, resourceType: 'listing' },
      }),
    ).toBe(22);
    expect(
      await prisma.client.listingReview.count({
        where: { listingId: created.body.id },
      }),
    ).toBe(2);
  });

  afterAll(async () => {
    if (viewingIds.length) {
      await prisma.client.viewingRescheduleProposal.deleteMany({
        where: { viewingAppointmentId: { in: viewingIds } },
      });
      await prisma.client.viewingAppointment.deleteMany({
        where: { id: { in: viewingIds } },
      });
    }
    if (inquiryIds.length) {
      await prisma.client.inquiry.deleteMany({
        where: { id: { in: inquiryIds } },
      });
    }
    if (listingIds.length) {
      const storedImages = await prisma.client.listingImage.findMany({
        select: { objectKey: true, thumbnailObjectKey: true },
        where: { listingId: { in: listingIds } },
      });
      for (const image of storedImages) {
        await storage.deleteObject(image.objectKey);
        if (image.thumbnailObjectKey) {
          await storage.deleteObject(image.thumbnailObjectKey);
        }
      }
      await prisma.client.auditLog.deleteMany({
        where: { resourceId: { in: listingIds }, resourceType: 'listing' },
      });
      await prisma.client.listingPriceHistory.deleteMany({
        where: { listingId: { in: listingIds } },
      });
      await prisma.client.listingReview.deleteMany({
        where: { listingId: { in: listingIds } },
      });
      await prisma.client.listingHistory.deleteMany({
        where: { listingId: { in: listingIds } },
      });
      await prisma.client.listing.deleteMany({
        where: { id: { in: listingIds } },
      });
    }
    if (propertyIds.length) {
      await prisma.client.property.deleteMany({
        where: { id: { in: propertyIds } },
      });
    }
    if (userIds.length) {
      await prisma.client.auditLog.deleteMany({
        where: { actorId: { in: userIds } },
      });
      await prisma.client.agentProfile.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.client.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (agencyId)
      await prisma.client.agency.deleteMany({ where: { id: agencyId } });
    await app.close();
  });
});
