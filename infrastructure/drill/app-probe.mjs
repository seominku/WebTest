import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { hash } from "argon2";
import { createPrismaClient } from "@real-estate/db";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

// Runs only inside the isolated probe container, never loads .env.
assert.equal(new URL(process.env.DATABASE_URL).hostname, "drill-postgres");
assert.equal(new URL(process.env.REDIS_URL).hostname, "drill-redis");
assert.equal(process.env.S3_ENDPOINT, "http://drill-minio:9000");
assert.equal(process.env.CLAMAV_HOST, "drill-clamav");
assert.equal(process.env.APP_ENV, "staging");
const action = process.argv[2];
const statePath = "/tmp/drill-state.json";
const prisma = createPrismaClient(process.env.DATABASE_URL);
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const Bucket = "drill-assets";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, options) {
  return fetch(`http://drill-api:4000/api/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(12000),
  });
}
async function health(down) {
  const response = await request("health/ready");
  assert.equal(response.status, down ? 503 : 200);
  const body = await response.json();
  assert.equal(body.checks.length, 4);
  for (const check of body.checks)
    assert.equal(check.status, check.name === down ? "down" : "up");
  assert.equal((await request("health/live")).status, 200);
}
async function login(expected) {
  const response = await request("auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://drill-web",
    },
    body: JSON.stringify({
      email: "drill@example.test",
      password: process.env.DRILL_LOGIN_PASSWORD,
    }),
  });
  assert.equal(response.status, expected);
  if (expected === 503) {
    const body = await response.json();
    assert.equal(body.code, "REQUEST_PROTECTION_UNAVAILABLE");
    assert.match(body.message, /잠시 후/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  if (expected === 200) {
    const cookie = response.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (await request("auth/me", { headers: { Cookie: cookie } })).status,
      200,
    );
  }
}
async function seed() {
  const sql = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await sql.connect();
  try {
    const directories = (await readdir("/migrations", { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const directory of directories)
      await sql.query(
        await readFile(`/migrations/${directory}/migration.sql`, "utf8"),
      );
  } finally {
    await sql.end();
  }
  await s3.send(new CreateBucketCommand({ Bucket }));
  const user = await prisma.user.create({
    data: {
      email: "drill@example.test",
      displayName: "Synthetic drill agent",
      passwordHash: await hash(process.env.DRILL_LOGIN_PASSWORD),
      role: "AGENT",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const agency = await prisma.agency.create({
    data: {
      name: "Synthetic agency",
      licenseNumber: "DRILL-ONLY",
      phone: "000-0000-0000",
      status: "ACTIVE",
    },
  });
  const agent = await prisma.agentProfile.create({
    data: {
      userId: user.id,
      agencyId: agency.id,
      registrationNumber: "DRILL-ONLY",
      status: "ACTIVE",
    },
  });
  const property = await prisma.property.create({
    data: {
      agentId: agent.id,
      agencyId: agency.id,
      createdById: user.id,
      type: "APARTMENT",
      areaSquareMeters: "84.5",
      address: {
        create: {
          sido: "훈련",
          sigungu: "훈련",
          eupmyeondong: "훈련",
          roadAddress: "실제 주소 아님",
        },
      },
    },
  });
  const listing = await prisma.listing.create({
    data: {
      agentId: agent.id,
      propertyId: property.id,
      transactionType: "SALE",
      salePriceKrw: 100000000n,
      title: "Synthetic drill listing",
      description: "Only for isolated recovery testing",
      status: "PUBLISHED",
      publishedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
  await writeFile(
    statePath,
    JSON.stringify({ listingId: listing.id, images: [] }),
  );
}
async function queue(dependency) {
  const state = JSON.parse(await readFile(statePath));
  const body = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#235b45" },
  })
    .png()
    .toBuffer();
  const id = randomUUID();
  const objectKey = `listing-images/${state.listingId}/${id}/quarantine.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: objectKey,
      Body: body,
      ContentType: "image/png",
    }),
  );
  await prisma.listingImage.create({
    data: {
      id,
      listingId: state.listingId,
      objectKey,
      mimeType: "image/png",
      sizeBytes: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      sortOrder: state.images.length,
      // Storage queue is prepared before its container is stopped.
      nextAttemptAt:
        dependency === "object-storage" ? new Date(Date.now() + 5000) : null,
    },
  });
  state.images.push(id);
  await writeFile(statePath, JSON.stringify(state));
}
async function imageState(expected) {
  const state = JSON.parse(await readFile(statePath));
  const id = state.images.at(-1);
  for (let attempt = 0; attempt < 80; attempt++) {
    const row = await prisma.listingImage.findUniqueOrThrow({ where: { id } });
    if (
      expected === "retry" &&
      row.status === "UPLOADED" &&
      row.processingAttempts >= 1 &&
      row.nextAttemptAt
    ) {
      assert.equal(row.thumbnailObjectKey, null);
      assert.match(row.objectKey, /quarantine\.png$/);
      assert.equal(
        (await request(`listings/${state.listingId}/images/${id}/content`))
          .status,
        404,
      );
      return { attempts: row.processingAttempts, status: row.status };
    }
    if (expected === "ready" && row.status === "READY") {
      assert.ok(row.processingAttempts >= 2);
      for (const Key of [row.objectKey, row.thumbnailObjectKey]) {
        const object = await s3.send(new GetObjectCommand({ Bucket, Key }));
        assert.equal(object.ContentType, "image/webp");
        const body = await object.Body.transformToByteArray();
        const metadata = await sharp(body).metadata();
        assert.equal(metadata.format, "webp");
        await sharp(body).stats();
      }
      for (const kind of ["content", "thumbnail"]) {
        const response = await request(
          `listings/${state.listingId}/images/${id}/${kind}`,
        );
        assert.equal(response.status, 200);
        await sharp(Buffer.from(await response.arrayBuffer())).stats();
      }
      assert.equal(
        await prisma.listingHistory.count({
          where: {
            listingId: state.listingId,
            eventType: "listing.image_ready",
            changes: { path: ["imageId"], equals: id },
          },
        }),
        1,
      );
      return {
        attempts: row.processingAttempts,
        status: row.status,
        decodedObjects: 2,
        publicImagesVerified: 2,
      };
    }
    assert.notEqual(row.status, "REJECTED");
    await delay(500);
  }
  throw new Error(`IMAGE_${expected.toUpperCase()}_TIMEOUT`);
}
let result;
try {
  if (action === "seed") await seed();
  else if (action === "database-error-shape") {
    try {
      await prisma.$transaction((tx) => tx.listing.count());
    } catch (error) {
      result = {
        errorType: error.constructor.name,
        prismaCode: /^P\d{4}$/.test(error.code) ? error.code : null,
        temporaryDnsFailure: error.code === "EAI_AGAIN",
        metaKeys: Object.keys(error.meta ?? {}),
        causeType: error.cause?.constructor?.name,
        connectionRefused:
          /ECONNREFUSED|Can't reach database|Connection refused/i.test(
            error.message,
          ),
        transactionStartTimeout: /Unable to start a transaction/i.test(
          error.message,
        ),
      };
    }
  } else if (action === "healthy") {
    await health();
    await login(200);
    assert.equal((await request("listings")).status, 200);
  } else if (action === "db-down") {
    await health("postgres");
    const response = await request("listings");
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, "DATABASE_TEMPORARILY_UNAVAILABLE");
    assert.match(body.message, /잠시 후/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } else if (action === "redis-down") {
    await health("redis");
    await login(503);
    assert.equal((await request("listings")).status, 200);
  } else if (action === "storage-down") await health("object-storage");
  else if (action === "scanner-down") await health("malware-scanner");
  else if (action === "queue-storage") await queue("object-storage");
  else if (action === "queue-scanner") await queue("malware-scanner");
  else if (action === "retry") result = await imageState("retry");
  else if (action === "image-ready") result = await imageState("ready");
  else throw new Error("UNKNOWN_ACTION");
  console.log(JSON.stringify({ action, passed: true, ...result }));
} catch (error) {
  // Do not print Prisma queries, connection strings, or synthetic credentials.
  console.log(
    JSON.stringify({
      action,
      passed: false,
      code: error.code ?? error.name,
      actual: typeof error.actual === "number" ? error.actual : undefined,
      expected: typeof error.expected === "number" ? error.expected : undefined,
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  s3.destroy();
}
