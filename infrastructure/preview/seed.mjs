import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { hash } from "argon2";
import { createPrismaClient } from "@real-estate/db";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// Deliberately cannot target the original database or storage.
assert.equal(process.env.APP_ENV, "production");
assert.equal(process.env.PREVIEW_SEED_APPROVED, "synthetic-only");
assert.equal(
  process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).hostname,
  "preview-postgres",
);
assert.equal(new URL(process.env.DATABASE_URL).pathname, "/preview");
assert.equal(process.env.S3_ENDPOINT, "http://preview-minio:9000");
assert.equal(process.env.S3_BUCKET, "preview-assets");
const prisma = createPrismaClient(process.env.DATABASE_URL);
const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
try {
  await sql.connect();
  assert.equal(
    (
      await sql.query(
        "select count(*)::int as count from information_schema.tables where table_schema='public'",
      )
    ).rows[0].count,
    0,
  );
  for (const directory of (
    await readdir("/migrations", { withFileTypes: true })
  )
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort())
    await sql.query(
      await readFile(`/migrations/${directory}/migration.sql`, "utf8"),
    );
  await s3.send(new CreateBucketCommand({ Bucket: "preview-assets" }));
  const passwordHash = await hash(process.env.PREVIEW_APP_PASSWORD);
  const agentUser = await prisma.user.create({
    data: {
      email: "agent@example.test",
      displayName: "가상 테스트 중개사",
      passwordHash,
      role: "AGENT",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      email: "viewer@example.test",
      displayName: "가상 테스트 회원",
      passwordHash,
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const agency = await prisma.agency.create({
    data: {
      name: "가상 테스트 사무소 (실제 업체 아님)",
      licenseNumber: "PREVIEW-NOT-REAL",
      phone: "000-0000-0000",
      status: "ACTIVE",
    },
  });
  const agent = await prisma.agentProfile.create({
    data: {
      userId: agentUser.id,
      agencyId: agency.id,
      registrationNumber: "PREVIEW-NOT-REAL",
      status: "ACTIVE",
    },
  });
  for (let index = 0; index < 4; index++) {
    const property = await prisma.property.create({
      data: {
        agentId: agent.id,
        agencyId: agency.id,
        createdById: agentUser.id,
        type: "APARTMENT",
        areaSquareMeters: String(59.5 + index * 12.5),
        rooms: 3,
        bathrooms: 2,
        floor: index + 2,
        totalFloors: 15,
        address: {
          create: {
            sido: "서울특별시",
            sigungu: "성동구",
            eupmyeondong: "성수동1가",
            roadAddress: "가상 테스트 위치 — 실제 매물 주소 아님",
            latitude: "37.5445",
            longitude:
              index < 2 ? "127.0438" : String(127.0438 + index * 0.002),
            visibility: "APPROXIMATE",
          },
        },
      },
    });
    const listing = await prisma.listing.create({
      data: {
        agentId: agent.id,
        propertyId: property.id,
        transactionType: "SALE",
        salePriceKrw: BigInt(500000000 + index * 100000000),
        title: `[가상 테스트] ${index === 3 ? "사진 업로드용 초안" : `서울숲 샘플 ${index + 1}`}`,
        description:
          "외부 접속 확인을 위한 가상 매물입니다. 사진은 AI 생성 이미지이며, 표시 위치와 가격은 실제 매물 정보가 아닙니다. 개인정보와 실제 매물 사진은 입력하지 마세요.",
        status: index === 3 ? "DRAFT" : "PUBLISHED",
        publishedAt: index === 3 ? null : new Date(),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    if (index === 3) continue;
    for (const [sortOrder, name] of [
      "seoul-forest-living-room.webp",
      "seoul-forest-exterior.webp",
      "seoul-forest-bedroom.webp",
    ].entries()) {
      // Only version-controlled synthetic artwork is seeded READY. User uploads still use ClamAV.
      const body = await readFile(`/samples/${name}`);
      const metadata = await sharp(body).metadata();
      const thumb = await sharp(body)
        .resize({ width: 480, withoutEnlargement: true })
        .webp()
        .toBuffer();
      const id = randomUUID(),
        objectKey = `listing-images/${listing.id}/${id}/original.webp`,
        thumbnailObjectKey = `listing-images/${listing.id}/${id}/thumbnail.webp`;
      for (const [Key, Body] of [
        [objectKey, body],
        [thumbnailObjectKey, thumb],
      ])
        await s3.send(
          new PutObjectCommand({
            Bucket: "preview-assets",
            Key,
            Body,
            ContentType: "image/webp",
          }),
        );
      await prisma.listingImage.create({
        data: {
          id,
          listingId: listing.id,
          objectKey,
          thumbnailObjectKey,
          mimeType: "image/webp",
          sizeBytes: body.length,
          width: metadata.width,
          height: metadata.height,
          sha256: createHash("sha256").update(body).digest("hex"),
          sortOrder,
          status: "READY",
        },
      });
    }
  }
  console.log(
    JSON.stringify({
      seeded: true,
      accounts: 2,
      published: 3,
      drafts: 1,
      syntheticImages: 9,
    }),
  );
} catch {
  console.error("PREVIEW_SEED_FAILED");
  process.exitCode = 1;
} finally {
  await sql.end();
  await prisma.$disconnect();
  s3.destroy();
}
