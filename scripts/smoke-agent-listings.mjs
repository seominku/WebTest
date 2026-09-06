import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hash } from "argon2";
import sharp from "sharp";
import {
  AgencyStatus,
  AgentStatus,
  UserRole,
  UserStatus,
  createPrismaClient,
} from "@real-estate/db";

function loadEnvironment(path) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvironment(new URL("../.env", import.meta.url));
const apiBase = (
  process.env.SMOKE_API_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");
const origin = process.env.SMOKE_WEB_ORIGIN ?? "http://localhost:3000";
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}` +
    `@localhost:5432/${process.env.POSTGRES_DB}?schema=public`;
const prisma = createPrismaClient(databaseUrl);
const password = "SmokeAgentPassword123!";
const email = `smoke-agent-${randomUUID()}@example.test`;
let cookie;
let csrfToken;
let agencyId;
let userId;
let agentId;
let listingId;
let propertyId;

async function api(path, options = {}, expectedStatus = 200) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${apiBase}${path}`, { ...options, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  const body = await response.json().catch(() => undefined);
  if (response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status}`,
    );
  }
  return body;
}

try {
  const setup = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        displayName: "매물 스모크 중개사",
        email,
        emailVerifiedAt: new Date(),
        passwordHash: await hash(password),
        role: UserRole.AGENT,
        status: UserStatus.ACTIVE,
      },
    });
    const agency = await transaction.agency.create({
      data: {
        licenseNumber: `SMOKE-${randomUUID()}`,
        name: "매물 스모크 중개사무소",
        phone: "02-0000-0000",
        status: AgencyStatus.ACTIVE,
      },
    });
    const agent = await transaction.agentProfile.create({
      data: {
        agencyId: agency.id,
        registrationNumber: `SMOKE-AGENT-${randomUUID()}`,
        status: AgentStatus.ACTIVE,
        userId: user.id,
      },
    });
    return { agency, agent, user };
  });
  agencyId = setup.agency.id;
  agentId = setup.agent.id;
  userId = setup.user.id;

  const login = await api(
    "/auth/login",
    {
      body: JSON.stringify({ email, password }),
      headers: { Origin: origin },
      method: "POST",
    },
    200,
  );
  csrfToken = login.csrfToken;
  const input = {
    addressVisibility: "APPROXIMATE",
    areaSquareMeters: "59.87",
    bathrooms: 1,
    depositKrw: "10000000",
    description:
      "실행 중인 Docker API의 매물 등록과 수정을 검증하는 가상 매물입니다.",
    eupmyeondong: "역삼동",
    floor: 6,
    maintenanceFeeKrw: "120000",
    monthlyRentKrw: "900000",
    propertyType: "OFFICETEL",
    roadAddress: "서울특별시 강남구 테스트로 20",
    rooms: 1,
    sido: "서울특별시",
    sigungu: "강남구",
    title: "Docker 매물 관리 스모크 초안",
    totalFloors: 12,
    transactionType: "MONTHLY_RENT",
  };
  const created = await api(
    "/listings",
    {
      body: JSON.stringify(input),
      headers: { Origin: origin, "X-CSRF-Token": csrfToken },
      method: "POST",
    },
    201,
  );
  listingId = created.id;
  propertyId = (
    await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })
  ).propertyId;
  if (created.status !== "DRAFT" || created.version !== 1) {
    throw new Error("New listing was not created as draft version 1");
  }
  const mine = await api("/listings/mine");
  if (!mine.items.some((item) => item.id === listingId)) {
    throw new Error("Created listing is missing from the owner list");
  }
  const updated = await api(
    `/listings/${listingId}`,
    {
      body: JSON.stringify({
        ...input,
        areaSquareMeters: "60",
        title: "수정된 Docker 매물 초안",
        version: 1,
      }),
      headers: { Origin: origin, "X-CSRF-Token": csrfToken },
      method: "PUT",
    },
    200,
  );
  if (updated.version !== 2 || updated.property.areaSquareMeters !== "60") {
    throw new Error("Listing version or integer area update was not applied");
  }
  await api(
    `/listings/${listingId}`,
    {
      body: JSON.stringify({ ...input, version: 1 }),
      headers: { Origin: origin, "X-CSRF-Token": csrfToken },
      method: "PUT",
    },
    409,
  );
  await api(`/listings/${listingId}`, {}, 404);
  const imageBuffer = await sharp({
    create: {
      background: { b: 80, g: 150, r: 230 },
      channels: 3,
      height: 600,
      width: 800,
    },
  })
    .png()
    .toBuffer();
  const uploadForm = new FormData();
  uploadForm.set("version", "2");
  uploadForm.set(
    "image",
    new Blob([imageBuffer], { type: "image/png" }),
    "smoke.png",
  );
  const uploaded = await api(
    `/listings/mine/${listingId}/images`,
    {
      body: uploadForm,
      headers: { Origin: origin, "X-CSRF-Token": csrfToken },
      method: "POST",
    },
    201,
  );
  if (uploaded.version !== 3 || uploaded.image.status !== "UPLOADED") {
    throw new Error("Image was not queued for malware scanning");
  }
  let processedImage;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const managed = await api(`/listings/mine/${listingId}`);
    processedImage = managed.images.find(
      (image) => image.id === uploaded.image.id,
    );
    if (processedImage?.status === "READY") break;
    if (processedImage?.status === "REJECTED") {
      throw new Error(
        `Safe image was rejected: ${processedImage.rejectionReason}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (
    processedImage?.status !== "READY" ||
    processedImage.mimeType !== "image/webp" ||
    !processedImage.thumbnailPath
  ) {
    throw new Error("Image scan or WebP thumbnail generation did not finish");
  }
  await api(
    `/listings/mine/${listingId}/images/${uploaded.image.id}/content`,
    {},
    200,
  );
  await api(
    `/listings/mine/${listingId}/images/${uploaded.image.id}/thumbnail`,
    {},
    200,
  );
  await api(
    `/listings/${listingId}/images/${uploaded.image.id}/content`,
    {},
    404,
  );
  const removed = await api(
    `/listings/mine/${listingId}/images/${uploaded.image.id}`,
    {
      body: JSON.stringify({ version: 3 }),
      headers: { Origin: origin, "X-CSRF-Token": csrfToken },
      method: "DELETE",
    },
    200,
  );
  if (removed.version !== 4) {
    throw new Error("Image removal did not advance the listing version");
  }
  const [historyCount, priceCount, auditCount] = await Promise.all([
    prisma.listingHistory.count({ where: { listingId } }),
    prisma.listingPriceHistory.count({ where: { listingId } }),
    prisma.auditLog.count({ where: { resourceId: listingId } }),
  ]);
  if (historyCount !== 5 || priceCount !== 2 || auditCount !== 5) {
    throw new Error(
      "Expected listing histories and audit logs were not created",
    );
  }
  console.log(
    JSON.stringify({
      checks: [
        "agent-login",
        "draft-create",
        "decimal-and-integer-area",
        "owner-list",
        "versioned-update",
        "stale-update-rejected",
        "draft-not-public",
        "image-malware-scanned",
        "image-normalized-to-webp",
        "image-thumbnail-generated",
        "draft-image-owner-only",
        "image-delete-and-storage-cleanup",
        "history-and-audit",
      ],
      status: "ok",
    }),
  );
} finally {
  if (listingId) {
    await prisma.auditLog.deleteMany({ where: { resourceId: listingId } });
    await prisma.listingPriceHistory.deleteMany({ where: { listingId } });
    await prisma.listingHistory.deleteMany({ where: { listingId } });
    await prisma.listing.deleteMany({ where: { id: listingId } });
  }
  if (propertyId)
    await prisma.property.deleteMany({ where: { id: propertyId } });
  if (userId) await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  if (agentId) await prisma.agentProfile.deleteMany({ where: { id: agentId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (agencyId) await prisma.agency.deleteMany({ where: { id: agencyId } });
  await prisma.$disconnect();
}
