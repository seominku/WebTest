import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import pg from "pg";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

const maximumImages = 10000;
const workspace = fileURLToPath(new URL("../", import.meta.url));

export function validateRecoveryEnvironment(environment) {
  const database = new URL(environment.DATABASE_URL);
  const storage = new URL(environment.S3_ENDPOINT);
  const local = (url) =>
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (
    !local(database) ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    database.hash ||
    [...database.searchParams.keys()].some((key) => key !== "schema")
  ) {
    throw new Error("Invalid local database configuration");
  }
  if (
    !local(storage) ||
    storage.protocol !== "http:" ||
    storage.username ||
    storage.password ||
    storage.search ||
    storage.hash ||
    storage.pathname !== "/"
  ) {
    throw new Error("Invalid local storage configuration");
  }
  for (const key of [
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
  ]) {
    if (!environment[key]?.trim())
      throw new Error("Incomplete storage configuration");
  }
}

export function imageReferenceFingerprint(rows) {
  // Fingerprint metadata for concurrent-change detection, NOT image integrity.
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export async function inspectImageReferences(rows, headObject) {
  if (rows.length > maximumImages)
    throw new Error("Image inventory exceeds local check limit");
  const issues = {};
  let readyImages = 0;
  let verifiedObjects = 0;
  let verifiedBytes = 0;
  const statusCounts = {};
  const tasks = [];
  const issue = (reason) => {
    issues[reason] = (issues[reason] ?? 0) + 1;
  };
  for (const row of rows) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
    if (row.status !== "READY") continue;
    readyImages += 1;
    if (row.object_key)
      tasks.push({
        key: row.object_key,
        kind: "full",
        bytes: row.size_bytes,
        mime: row.mime_type,
      });
    else issue("full_reference_missing");
    if (row.thumbnail_object_key)
      tasks.push({
        key: row.thumbnail_object_key,
        kind: "thumbnail",
        mime: "image/webp",
      });
    else issue("thumbnail_reference_missing");
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, tasks.length) }, async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        try {
          const metadata = await headObject(task.key);
          if (
            !Number.isSafeInteger(metadata.ContentLength) ||
            metadata.ContentLength <= 0 ||
            (task.kind === "full" && metadata.ContentLength !== task.bytes)
          ) {
            issue(`${task.kind}_size_mismatch`);
          } else if (metadata.ContentType !== task.mime) {
            issue(`${task.kind}_type_mismatch`);
          } else {
            verifiedObjects += 1;
            verifiedBytes += metadata.ContentLength;
          }
        } catch (error) {
          const status = error?.$metadata?.httpStatusCode;
          issue(
            `${task.kind}_${status === 404 ? "missing" : status === 403 ? "access_denied" : "unavailable"}`,
          );
        }
      }
    }),
  );

  const inProgressImages =
    (statusCounts.UPLOADED ?? 0) + (statusCounts.SCANNING ?? 0);
  return {
    status:
      Object.keys(issues).length || inProgressImages
        ? "needs_attention"
        : readyImages
          ? "ok"
          : "no_ready_images",
    imageRows: rows.length,
    statusCounts,
    readyImages,
    inProgressImages,
    verifiedObjects,
    verifiedBytes,
    issues,
    verification: "HEAD metadata only; not content checksum or restore proof",
  };
}

export async function runRecoveryPreflight(environment) {
  validateRecoveryEnvironment(environment);
  const database = new pg.Client({
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    query_timeout: 10000,
    options: "-c default_transaction_read_only=on -c statement_timeout=5000",
  });
  const storage = new S3Client({
    endpoint: environment.S3_ENDPOINT,
    region: environment.S3_REGION,
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY,
      secretAccessKey: environment.S3_SECRET_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 1,
    followRegionRedirects: false,
  });
  const query = `SELECT id, status::text, object_key, thumbnail_object_key, size_bytes, mime_type
    FROM listing_images ORDER BY id LIMIT ${maximumImages + 1}`;
  try {
    await database.connect();
    const readOnly = await database.query("SHOW transaction_read_only");
    if (readOnly.rows[0].transaction_read_only !== "on")
      throw new Error("Read-only connection required");
    const before = (await database.query(query)).rows;
    const result = await inspectImageReferences(before, (key) =>
      storage.send(
        new HeadObjectCommand({ Bucket: environment.S3_BUCKET, Key: key }),
        { abortSignal: AbortSignal.timeout(5000) },
      ),
    );
    const after = (await database.query(query)).rows;
    const referencesUnchanged =
      imageReferenceFingerprint(before) === imageReferenceFingerprint(after);
    return {
      ...result,
      status: referencesUnchanged ? result.status : "needs_attention",
      checkedAt: new Date().toISOString(),
      scope: "local_read_only_ready_image_metadata",
      databaseReadOnly: true,
      referencesUnchanged,
      backupCreated: false,
      restorePerformed: false,
    };
  } finally {
    storage.destroy();
    await database.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const environment = {
      ...parseEnv(readFileSync(resolve(workspace, ".env"), "utf8")),
      ...process.env,
    };
    const report = await runRecoveryPreflight(environment);
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ok") process.exitCode = 1;
  } catch {
    console.error(
      "복구 사전 점검 실패: 로컬 연결 설정·접근 권한·응답 제한을 확인하세요. 인증정보와 원문 오류는 출력하지 않습니다.",
    );
    process.exitCode = 1;
  }
}
