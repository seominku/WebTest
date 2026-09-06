import { config as loadEnvironment } from "dotenv";
import { resolve } from "node:path";
import {
  AddressVisibility,
  AgencyStatus,
  AgentStatus,
  ListingStatus,
  PropertyType,
  TransactionType,
  UserRole,
  UserStatus,
} from "./generated/prisma/client.js";
import { createPrismaClient } from "./client.js";

loadEnvironment({ path: resolve(process.cwd(), "../../.env") });

const environment = process.env.APP_ENV ?? "local";
if (environment !== "local" && environment !== "test") {
  throw new Error("Sample data can only be seeded in local or test");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const prisma = createPrismaClient(process.env.DATABASE_URL);
const publishedAt = new Date("2026-09-01T00:00:00.000Z");
const expiresAt = new Date("2027-09-01T00:00:00.000Z");

const ids = {
  admin: "10000000-0000-4000-8000-000000000002",
  agency: "20000000-0000-4000-8000-000000000001",
  agent: "30000000-0000-4000-8000-000000000001",
  customer: "10000000-0000-4000-8000-000000000003",
  user: "10000000-0000-4000-8000-000000000001",
};

const samples = [
  {
    address: {
      eupmyeondong: "성수동1가",
      id: "50000000-0000-4000-8000-000000000001",
      roadAddress: "서울특별시 성동구 왕십리로 00",
      latitude: 37.5446,
      longitude: 127.0557,
      sido: "서울특별시",
      sigungu: "성동구",
      visibility: AddressVisibility.APPROXIMATE,
    },
    listing: {
      description:
        "서울숲 생활권의 남향 아파트입니다. 교통과 생활 편의시설을 도보로 이용할 수 있으며, 실제 계약 전 현장 확인과 권리관계 검토가 필요합니다.",
      id: "60000000-0000-4000-8000-000000000001",
      salePriceKrw: 1_280_000_000n,
      title: "서울숲 생활권 남향 아파트",
      transactionType: TransactionType.SALE,
    },
    property: {
      areaSquareMeters: "84.92",
      bathrooms: 2,
      buildYear: 2018,
      floor: 12,
      id: "40000000-0000-4000-8000-000000000001",
      rooms: 3,
      totalFloors: 25,
      type: PropertyType.APARTMENT,
    },
  },
  {
    address: {
      eupmyeondong: "서교동",
      id: "50000000-0000-4000-8000-000000000002",
      roadAddress: "서울특별시 마포구 양화로 00",
      latitude: 37.5563,
      longitude: 126.9236,
      sido: "서울특별시",
      sigungu: "마포구",
      visibility: AddressVisibility.PUBLIC,
    },
    listing: {
      depositKrw: 20_000_000n,
      description:
        "홍대입구역 인근의 채광 좋은 오피스텔입니다. 업무지구 이동이 편리하고 기본 생활 옵션을 갖춘 가상 학습용 매물입니다.",
      id: "60000000-0000-4000-8000-000000000002",
      maintenanceFeeKrw: 150_000n,
      monthlyRentKrw: 1_200_000n,
      title: "홍대입구역 도보권 오피스텔",
      transactionType: TransactionType.MONTHLY_RENT,
    },
    property: {
      areaSquareMeters: "29.41",
      bathrooms: 1,
      buildYear: 2021,
      floor: 8,
      id: "40000000-0000-4000-8000-000000000002",
      rooms: 1,
      totalFloors: 15,
      type: PropertyType.OFFICETEL,
    },
  },
  {
    address: {
      eupmyeondong: "광교동",
      id: "50000000-0000-4000-8000-000000000003",
      roadAddress: "경기도 수원시 영통구 광교로 00",
      latitude: 37.2859,
      longitude: 127.0467,
      sido: "경기도",
      sigungu: "수원시 영통구",
      visibility: AddressVisibility.EXACT_AFTER_INQUIRY,
    },
    listing: {
      depositKrw: 620_000_000n,
      description:
        "광교 호수공원 생활권의 단독주택 전세입니다. 조용한 주거 환경과 넉넉한 실내 공간을 갖춘 가상 학습용 매물입니다.",
      id: "60000000-0000-4000-8000-000000000003",
      title: "광교 호수공원 생활권 단독주택",
      transactionType: TransactionType.JEONSE,
    },
    property: {
      areaSquareMeters: "118.70",
      bathrooms: 2,
      buildYear: 2016,
      floor: 1,
      id: "40000000-0000-4000-8000-000000000003",
      rooms: 4,
      totalFloors: 2,
      type: PropertyType.HOUSE,
    },
  },
] as const;

// 지도에서 동일 지역 매물 묶음을 확인할 수 있도록 성수동 샘플 2건을 추가한다.
const seededSamples = [
  ...samples,
  {
    ...samples[0],
    address: {
      ...samples[0].address,
      id: "50000000-0000-4000-8000-000000000004",
      latitude: 37.5452,
      longitude: 127.0564,
    },
    listing: {
      ...samples[0].listing,
      id: "60000000-0000-4000-8000-000000000005",
      title: "서울숲 인근 리모델링 아파트",
      salePriceKrw: 1_090_000_000n,
    },
    property: {
      ...samples[0].property,
      id: "40000000-0000-4000-8000-000000000004",
      areaSquareMeters: "72.18",
      floor: 7,
    },
  },
  {
    ...samples[0],
    address: {
      ...samples[0].address,
      id: "50000000-0000-4000-8000-000000000005",
      latitude: 37.5439,
      longitude: 127.0549,
    },
    listing: {
      ...samples[0].listing,
      id: "60000000-0000-4000-8000-000000000006",
      title: "성수역 생활권 채광 좋은 아파트",
      salePriceKrw: 1_350_000_000n,
    },
    property: {
      ...samples[0].property,
      id: "40000000-0000-4000-8000-000000000005",
      areaSquareMeters: "91.36",
      floor: 15,
    },
  },
] as const;

try {
  await prisma.$transaction(async (transaction) => {
    await transaction.user.upsert({
      create: {
        displayName: "박관심 고객",
        email: "seed-user@local.invalid",
        emailVerifiedAt: publishedAt,
        id: ids.customer,
        passwordHash:
          "$argon2id$v=19$m=65536,p=1,t=3$gaPGH8r1jglv+0snzBX/yg$0GZOstP8S7YTo+QYbbf3TkM4KJ0c8teyaYEAnU8GWn4",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      update: {
        failedLoginCount: 0,
        lockedUntil: null,
        passwordHash:
          "$argon2id$v=19$m=65536,p=1,t=3$gaPGH8r1jglv+0snzBX/yg$0GZOstP8S7YTo+QYbbf3TkM4KJ0c8teyaYEAnU8GWn4",
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
      },
      where: { id: ids.customer },
    });
    await transaction.user.upsert({
      create: {
        displayName: "김바른 중개사",
        email: "seed-agent@local.invalid",
        emailVerifiedAt: publishedAt,
        id: ids.user,
        passwordHash:
          "$argon2id$v=19$m=65536,p=1,t=3$gaPGH8r1jglv+0snzBX/yg$0GZOstP8S7YTo+QYbbf3TkM4KJ0c8teyaYEAnU8GWn4",
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
      },
      update: {
        failedLoginCount: 0,
        lockedUntil: null,
        passwordHash:
          "$argon2id$v=19$m=65536,p=1,t=3$gaPGH8r1jglv+0snzBX/yg$0GZOstP8S7YTo+QYbbf3TkM4KJ0c8teyaYEAnU8GWn4",
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
      },
      where: { id: ids.user },
    });
    await transaction.user.upsert({
      create: {
        displayName: "로컬 검수 관리자",
        email: "seed-admin@local.invalid",
        emailVerifiedAt: publishedAt,
        id: ids.admin,
        passwordHash:
          "$argon2id$v=19$m=65536,p=4,t=3$lKKgWZkHQwEafDiKBZSKow$zq2jcuQc57UB+kFF+uE6CoerDJfn26RVMhiBnlmnVcE",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      update: {
        failedLoginCount: 0,
        lockedUntil: null,
        passwordHash:
          "$argon2id$v=19$m=65536,p=4,t=3$lKKgWZkHQwEafDiKBZSKow$zq2jcuQc57UB+kFF+uE6CoerDJfn26RVMhiBnlmnVcE",
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
      where: { id: ids.admin },
    });
    await transaction.agency.upsert({
      create: {
        id: ids.agency,
        licenseNumber: "LOCAL-SAMPLE-0001",
        name: "바른공인중개사사무소",
        phone: "02-0000-0000",
        status: AgencyStatus.ACTIVE,
      },
      update: {},
      where: { id: ids.agency },
    });
    await transaction.agentProfile.upsert({
      create: {
        agencyId: ids.agency,
        id: ids.agent,
        isRepresentative: true,
        registrationNumber: "LOCAL-AGENT-0001",
        status: AgentStatus.ACTIVE,
        userId: ids.user,
      },
      update: {},
      where: { id: ids.agent },
    });

    for (const sample of seededSamples) {
      await transaction.property.upsert({
        create: {
          ...sample.property,
          agencyId: ids.agency,
          agentId: ids.agent,
          createdById: ids.user,
        },
        update: {},
        where: { id: sample.property.id },
      });
      await transaction.propertyAddress.upsert({
        create: { ...sample.address, propertyId: sample.property.id },
        update: {
          latitude: sample.address.latitude,
          longitude: sample.address.longitude,
        },
        where: { id: sample.address.id },
      });
      await transaction.listing.upsert({
        create: {
          ...sample.listing,
          agentId: ids.agent,
          expiresAt,
          propertyId: sample.property.id,
          publishedAt,
          status: ListingStatus.PUBLISHED,
        },
        update: {},
        where: { id: sample.listing.id },
      });
    }

    await transaction.listing.upsert({
      create: {
        agentId: ids.agent,
        description:
          "공개 API에서 절대 노출되면 안 되는 초안 검증용 매물입니다.",
        id: "60000000-0000-4000-8000-000000000004",
        propertyId: samples[0].property.id,
        salePriceKrw: 990_000_000n,
        status: ListingStatus.DRAFT,
        title: "비공개 초안 검증용 매물",
        transactionType: TransactionType.SALE,
      },
      update: {},
      where: { id: "60000000-0000-4000-8000-000000000004" },
    });
  });

  console.log(`Seeded ${seededSamples.length} synthetic public listings.`);
} finally {
  await prisma.$disconnect();
}
