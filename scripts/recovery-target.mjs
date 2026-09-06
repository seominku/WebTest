// Executed ONLY in an isolated helper container with /bundle mounted read-only.
import { readFile } from "node:fs/promises";
import pg from "pg";
import sharp from "sharp";
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  bundleFilename,
  captureDatabase,
  digest,
  requireRecovery,
  verifyBytes,
  validateObjectCoverage,
} from "./recovery-common.mjs";

const bucket = "recovery-assets";
const database = new pg.Client({
  host: "recovery-postgres",
  user: "recovery",
  database: "recovery",
  password: process.env.RECOVERY_PASSWORD,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});
const storage = new S3Client({
  endpoint: "http://recovery-minio:9000",
  region: "us-east-1",
  forcePathStyle: true,
  maxAttempts: 1,
  credentials: {
    accessKeyId: "recovery-admin",
    secretAccessKey: process.env.RECOVERY_STORAGE_PASSWORD,
  },
});
const send = (command) =>
  storage.send(command, { abortSignal: AbortSignal.timeout(10000) });
const localBytes = (entry) => readFile(`/bundle/${bundleFilename(entry.file)}`);
async function decode(bytes) {
  await sharp(bytes, { failOn: "warning", limitInputPixels: 40000000 }).stats();
}
async function verifyObject(entry) {
  const response = await send(
    new GetObjectCommand({ Bucket: bucket, Key: entry.key }),
  );
  const bytes = await response.Body.transformToByteArray();
  verifyBytes(bytes, entry);
  requireRecovery(
    response.ContentType === "image/webp",
    "RESTORED_MIME_MISMATCH",
  );
  await decode(bytes);
}

try {
  const manifest = JSON.parse(await readFile("/bundle/manifest.json", "utf8"));
  requireRecovery(
    manifest.format === 1 && manifest.backupComplete === true,
    "INCOMPLETE_BUNDLE",
  );
  validateObjectCoverage(manifest);
  requireRecovery(
    digest(await readFile("/bundle/database.dump")) === manifest.dumpSha256,
    "DUMP_MISMATCH",
  );
  await database.connect();
  const restored = await captureDatabase(database);
  requireRecovery(
    JSON.stringify(restored) === JSON.stringify(manifest.database),
    "DATABASE_CONTENT_MISMATCH",
  );
  await send(new CreateBucketCommand({ Bucket: bucket }));
  requireRecovery(manifest.objects.length > 0, "NO_READY_OBJECTS");
  for (const entry of manifest.objects) {
    const bytes = await localBytes(entry);
    verifyBytes(bytes, entry);
    await send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: entry.key,
        Body: bytes,
        ContentType: "image/webp",
      }),
    );
    await verifyObject(entry);
  }
  for (const entry of manifest.samples) {
    const bytes = await localBytes(entry);
    verifyBytes(bytes, entry);
    await decode(bytes);
  }

  // Negative tests affect this temporary bucket ONLY; source credentials are absent.
  const first = manifest.objects[0];
  await send(new DeleteObjectCommand({ Bucket: bucket, Key: first.key }));
  let missingDetected = false;
  try {
    await verifyObject(first);
  } catch (error) {
    missingDetected = error?.$metadata?.httpStatusCode === 404;
  }
  requireRecovery(missingDetected, "MISSING_OBJECT_NOT_DETECTED");
  await send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: first.key,
      Body: Buffer.from("synthetic corruption"),
      ContentType: "image/webp",
    }),
  );
  let corruptionDetected = false;
  try {
    await verifyObject(first);
  } catch (error) {
    corruptionDetected = error.recoveryCode === "CONTENT_MISMATCH";
  }
  requireRecovery(corruptionDetected, "CORRUPTION_NOT_DETECTED");
  await send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: first.key,
      Body: await localBytes(first),
      ContentType: "image/webp",
    }),
  );
  for (const entry of manifest.objects) await verifyObject(entry);
  console.log(
    JSON.stringify({
      status: "ok",
      tablesVerified: restored.tables.length,
      rowsVerified: restored.tables.reduce((sum, table) => sum + table.rows, 0),
      readyImages: restored.images.filter((row) => row.status === "READY")
        .length,
      objectsVerified: manifest.objects.length,
      samplesVerified: manifest.samples.length,
      missingDetected,
      corruptionDetected,
      finalRestoredObjectsValid: true,
    }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      status: "failed",
      code: error.recoveryCode ?? "TARGET_CHECK_FAILED",
    }),
  );
  process.exitCode = 1;
} finally {
  await database.end();
  storage.destroy();
}
