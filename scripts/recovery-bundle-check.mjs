import { randomBytes, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  lstat,
  realpath,
  readFile,
  writeFile,
  readdir,
  open,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify, parseEnv } from "node:util";
import pg from "pg";
import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { validateRecoveryEnvironment } from "./recovery-preflight.mjs";
import {
  loadRecoveryBundle,
  parseRecoveryArguments,
} from "./recovery-bundle-input.mjs";
import {
  captureDatabase,
  imageQuery,
  digest,
  requireRecovery,
  assertOwnedResource,
} from "./recovery-common.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
const dockerExecutable =
  process.platform === "win32" &&
  existsSync("C:/Program Files/Docker/Docker/resources/bin/docker.exe")
    ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe"
    : "docker";
const pgImage =
  "postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2";
const storageImage =
  "quay.io/minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e";
const helperImage =
  "sha256:ac92aedf39f151cec7687cfa64b67f6a7330fe8097dfaf74b706541a7189f94a";
const runId = randomUUID();
const resourcePrefix = `recovery-${runId}`;
const ownedNames = [];
let networkId;
let bundleDirectory;
let restoreOnly = false;
let validatedBundle;
let reportDirectory;
let stage = "preflight";
let result;
let failure;
const cleanupErrors = [];
const transientEnvironment = {
  ...process.env,
  RECOVERY_PASSWORD: randomBytes(32).toString("hex"),
  RECOVERY_STORAGE_PASSWORD: randomBytes(32).toString("hex"),
};
async function docker(args) {
  try {
    return (
      await promisify(execFile)(dockerExecutable, args, {
        cwd: workspace,
        env: transientEnvironment,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout.trim();
  } catch {
    throw Object.assign(new Error("DOCKER_COMMAND_FAILED"), {
      recoveryCode: "DOCKER_COMMAND_FAILED",
    });
  }
}
const inspect = async (id) => JSON.parse(await docker(["inspect", id]))[0];
function progress(value) {
  stage = value;
  console.log(JSON.stringify({ stage }));
}
async function binaryDocker(args, file, direction) {
  const fd = await open(file, direction === "out" ? "wx" : "r", 0o600);
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(dockerExecutable, args, {
        cwd: workspace,
        env: transientEnvironment,
        windowsHide: true,
        timeout: 120000,
        stdio:
          direction === "out"
            ? ["ignore", fd.fd, "pipe"]
            : [fd.fd, "ignore", "pipe"],
      });
      child.stderr.resume();
      child.once("error", () =>
        reject(
          Object.assign(new Error("BINARY_COMMAND_FAILED"), {
            recoveryCode: "BINARY_COMMAND_FAILED",
          }),
        ),
      );
      child.once("close", (code) =>
        code === 0
          ? resolvePromise()
          : reject(
              Object.assign(new Error("BINARY_COMMAND_FAILED"), {
                recoveryCode: "BINARY_COMMAND_FAILED",
              }),
            ),
      );
    });
  } finally {
    await fd.close();
  }
}
async function container(service, args) {
  const name = `${resourcePrefix}-${service}`;
  ownedNames.push(name);
  const id = await docker([
    "create",
    "--name",
    name,
    "--label",
    `recovery.run=${runId}`,
    "--label",
    "com.docker.compose.project=real-estate-recovery",
    "--network",
    networkId,
    "--network-alias",
    `recovery-${service}`,
    "--security-opt",
    "no-new-privileges:true",
    ...args,
  ]);
  assertOwnedResource(await inspect(id), runId);
  await docker(["start", id]);
  return id;
}
async function waitReady(id, args) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await docker(["exec", id, ...args]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  requireRecovery(false, "TEMP_SERVICE_NOT_READY");
}

let source;
let sourceStorage;
try {
  const arguments_ = parseRecoveryArguments(process.argv.slice(2));
  restoreOnly = arguments_.restoreOnly;
  let sourceId;
  if (restoreOnly) {
    progress("validate_existing_backup_without_source");
    validatedBundle = await loadRecoveryBundle(workspace, arguments_.input);
    bundleDirectory = validatedBundle.directory;
    const artifacts = resolve(workspace, ".artifacts");
    await mkdir(artifacts, { recursive: true, mode: 0o700 });
    requireRecovery(
      !(await lstat(artifacts)).isSymbolicLink() &&
        (await realpath(artifacts)).toLowerCase() ===
          resolve(await realpath(workspace), ".artifacts").toLowerCase(),
      "UNSAFE_REPORT_DIRECTORY",
    );
    reportDirectory = resolve(artifacts, `recovery-restore-${runId}`);
    await mkdir(reportDirectory, { mode: 0o700 });
    for (const image of [pgImage, storageImage, helperImage])
      await docker(["image", "inspect", image]);
  } else {
    const environment = {
      ...parseEnv(await readFile(resolve(workspace, ".env"), "utf8")),
      ...process.env,
    };
    validateRecoveryEnvironment(environment);
    const databaseUrl = new URL(environment.DATABASE_URL);
    sourceId = await docker([
      "compose",
      "-f",
      "docker-compose.yml",
      "-p",
      "real-estate-platform",
      "ps",
      "-q",
      "postgres",
    ]);
    requireRecovery(/^[0-9a-f]{64}$/.test(sourceId), "SOURCE_DB_NOT_RUNNING");
    const sourceInfo = await inspect(sourceId);
    requireRecovery(
      sourceInfo.Config.Labels["com.docker.compose.project"] ===
        "real-estate-platform" &&
        sourceInfo.Config.Labels["com.docker.compose.service"] === "postgres",
      "SOURCE_DB_IDENTITY",
    );
    const sourceEnv = Object.fromEntries(
      sourceInfo.Config.Env.map((value) => {
        const index = value.indexOf("=");
        return [value.slice(0, index), value.slice(index + 1)];
      }),
    );
    requireRecovery(
      decodeURIComponent(databaseUrl.pathname.slice(1)) ===
        sourceEnv.POSTGRES_DB &&
        decodeURIComponent(databaseUrl.username) === sourceEnv.POSTGRES_USER,
      "SOURCE_DB_CONFIGURATION",
    );
    requireRecovery(
      sourceInfo.NetworkSettings.Ports["5432/tcp"].some(
        (port) =>
          port.HostIp === "127.0.0.1" &&
          port.HostPort === (databaseUrl.port || "5432"),
      ),
      "SOURCE_DB_PORT",
    );
    for (const image of [pgImage, storageImage, helperImage])
      await docker(["image", "inspect", image]);

    const backups = resolve(workspace, "backups");
    await mkdir(backups, { recursive: true, mode: 0o700 });
    requireRecovery(
      !(await lstat(backups)).isSymbolicLink() &&
        (await realpath(backups)).toLowerCase() ===
          resolve(await realpath(workspace), "backups").toLowerCase(),
      "UNSAFE_BACKUP_DIRECTORY",
    );
    bundleDirectory = resolve(backups, `recovery-${runId}`);
    await mkdir(bundleDirectory, { mode: 0o700 });
    source = new pg.Client({
      connectionString: environment.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      query_timeout: 30000,
      options: "-c default_transaction_read_only=on -c statement_timeout=30000",
    });
    sourceStorage = new S3Client({
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
    const sourceSend = (command) =>
      sourceStorage.send(command, { abortSignal: AbortSignal.timeout(15000) });
    progress("capture_database_snapshot");
    await source.connect();
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (
      await source.query("SELECT pg_export_snapshot() AS snapshot")
    ).rows[0].snapshot;
    const database = await captureDatabase(source);
    const objects = [];
    const manifest = {
      format: 1,
      runId,
      createdAt: new Date().toISOString(),
      backupComplete: false,
      database,
      objects,
      samples: [],
      excluded: [
        "REJECTED/quarantine and unreferenced storage objects",
        "environment secrets and Redis state (DB authentication records remain included)",
      ],
    };
    requireRecovery(
      database.images.some((row) => row.status === "READY"),
      "NO_READY_IMAGES",
    );
    await binaryDocker(
      [
        "exec",
        sourceId,
        "pg_dump",
        `--username=${sourceEnv.POSTGRES_USER}`,
        `--dbname=${sourceEnv.POSTGRES_DB}`,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--snapshot=${snapshot}`,
      ],
      resolve(bundleDirectory, "database.dump"),
      "out",
    );
    manifest.dumpSha256 = digest(
      await readFile(resolve(bundleDirectory, "database.dump")),
    );

    progress("copy_ready_images");
    let totalBytes = 0;
    for (const row of database.images.filter(
      (image) => image.status === "READY",
    )) {
      requireRecovery(
        row.object_key &&
          row.thumbnail_object_key &&
          row.mime_type === "image/webp",
        "INVALID_READY_REFERENCE",
      );
      for (const [kind, key] of [
        ["full", row.object_key],
        ["thumbnail", row.thumbnail_object_key],
      ]) {
        const head = await sourceSend(
          new HeadObjectCommand({ Bucket: environment.S3_BUCKET, Key: key }),
        );
        requireRecovery(
          head.ETag &&
            head.ContentType === "image/webp" &&
            head.ContentLength > 0 &&
            head.ContentLength <= 16 * 1024 * 1024,
          "SOURCE_OBJECT_METADATA",
        );
        if (kind === "full")
          requireRecovery(
            head.ContentLength === row.size_bytes,
            "SOURCE_OBJECT_SIZE",
          );
        totalBytes += head.ContentLength;
        requireRecovery(totalBytes <= 256 * 1024 * 1024, "BACKUP_SIZE_LIMIT");
        const response = await sourceSend(
          new GetObjectCommand({
            Bucket: environment.S3_BUCKET,
            Key: key,
            IfMatch: head.ETag,
          }),
        );
        const bytes = await response.Body.transformToByteArray();
        requireRecovery(
          bytes.length === head.ContentLength,
          "SOURCE_OBJECT_CHANGED",
        );
        const entry = {
          file: `asset-${String(objects.length + 1).padStart(4, "0")}.webp`,
          key,
          imageId: row.id,
          kind,
          bytes: bytes.length,
          sha256: digest(bytes),
          etag: head.ETag,
        };
        await writeFile(resolve(bundleDirectory, entry.file), bytes, {
          flag: "wx",
          mode: 0o600,
        });
        objects.push(entry);
      }
    }
    for (const entry of objects) {
      const current = await sourceSend(
        new HeadObjectCommand({
          Bucket: environment.S3_BUCKET,
          Key: entry.key,
        }),
      );
      requireRecovery(
        current.ETag === entry.etag && current.ContentLength === entry.bytes,
        "SOURCE_OBJECT_CHANGED",
      );
    }
    await source.query("COMMIT");
    requireRecovery(
      JSON.stringify((await source.query(imageQuery)).rows) ===
        JSON.stringify(database.images),
      "SOURCE_REFERENCES_CHANGED",
    );
    await source.end();
    source = undefined;
    sourceStorage.destroy();
    sourceStorage = undefined;

    const samplesDirectory = resolve(
      workspace,
      "apps/web/public/sample-listings",
    );
    for (const name of (await readdir(samplesDirectory)).sort()) {
      requireRecovery(/^[a-z0-9-]+\.webp$/.test(name), "UNSAFE_SAMPLE_FILE");
      requireRecovery(
        !(await lstat(resolve(samplesDirectory, name))).isSymbolicLink(),
        "UNSAFE_SAMPLE_FILE",
      );
      const bytes = await readFile(resolve(samplesDirectory, name));
      const entry = {
        file: `sample-${String(manifest.samples.length + 1).padStart(4, "0")}.webp`,
        originalName: name,
        bytes: bytes.length,
        sha256: digest(bytes),
      };
      await writeFile(resolve(bundleDirectory, entry.file), bytes, {
        flag: "wx",
        mode: 0o600,
      });
      manifest.samples.push(entry);
    }
    manifest.backupComplete = true;
    await writeFile(
      resolve(bundleDirectory, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      { flag: "wx", mode: 0o600 },
    );
  }

  progress("create_isolated_restore_services");
  networkId = await docker([
    "network",
    "create",
    "--internal",
    "--label",
    `recovery.run=${runId}`,
    "--label",
    "com.docker.compose.project=real-estate-recovery",
    `${resourcePrefix}-network`,
  ]);
  const network = JSON.parse(
    await docker(["network", "inspect", networkId]),
  )[0];
  assertOwnedResource(network, runId);
  requireRecovery(network.Internal === true, "NETWORK_NOT_ISOLATED");
  transientEnvironment.POSTGRES_PASSWORD =
    transientEnvironment.RECOVERY_PASSWORD;
  transientEnvironment.MINIO_ROOT_PASSWORD =
    transientEnvironment.RECOVERY_STORAGE_PASSWORD;
  const restoreDb = await container("postgres", [
    "--read-only",
    "--tmpfs",
    "/var/lib/postgresql:rw,size=256m",
    "--tmpfs",
    "/var/run/postgresql:rw",
    "--tmpfs",
    "/tmp:rw",
    "--env",
    "POSTGRES_PASSWORD",
    "--env",
    "POSTGRES_USER=recovery",
    "--env",
    "POSTGRES_DB=recovery",
    pgImage,
  ]);
  const restoreStorage = await container("minio", [
    "--read-only",
    "--tmpfs",
    "/data:rw,size=128m",
    "--tmpfs",
    "/tmp:rw",
    "--env",
    "MINIO_ROOT_PASSWORD",
    "--env",
    "MINIO_ROOT_USER=recovery-admin",
    storageImage,
    "server",
    "/data",
    "--config-dir",
    "/tmp/minio",
  ]);
  await waitReady(restoreDb, [
    "pg_isready",
    "--username=recovery",
    "--dbname=recovery",
  ]);
  await waitReady(restoreStorage, [
    "curl",
    "--fail",
    "--max-time",
    "3",
    "http://localhost:9000/minio/health/ready",
  ]);
  progress("restore_database");
  if (restoreOnly)
    requireRecovery(
      (await loadRecoveryBundle(workspace, bundleDirectory)).fingerprint ===
        validatedBundle.fingerprint,
      "BACKUP_CHANGED_DURING_CHECK",
    );
  assertOwnedResource(await inspect(restoreDb), runId);
  requireRecovery(restoreDb !== sourceId, "RESTORE_TARGET_IS_SOURCE");
  await binaryDocker(
    [
      "exec",
      "-i",
      restoreDb,
      "pg_restore",
      "--username=recovery",
      "--dbname=recovery",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
    ],
    resolve(bundleDirectory, "database.dump"),
    "in",
  );

  progress("verify_restored_database_and_images");
  const helper = await container("checker", [
    "--read-only",
    "--cap-drop",
    "ALL",
    "--env",
    "RECOVERY_PASSWORD",
    "--env",
    "RECOVERY_STORAGE_PASSWORD",
    "--mount",
    `type=bind,source=${bundleDirectory},target=/bundle,readonly`,
    "--mount",
    `type=bind,source=${resolve(workspace, "scripts/recovery-target.mjs")},target=/app/recovery-target.mjs,readonly`,
    "--mount",
    `type=bind,source=${resolve(workspace, "scripts/recovery-common.mjs")},target=/app/recovery-common.mjs,readonly`,
    "--entrypoint",
    "node",
    helperImage,
    "/app/recovery-target.mjs",
  ]);
  await docker(["wait", helper]);
  const helperInfo = await inspect(helper);
  result = JSON.parse(await docker(["logs", helper]));
  requireRecovery(helperInfo.State.ExitCode === 0, "TARGET_CHECK_FAILED");
  requireRecovery(result.status === "ok", "TARGET_CHECK_FAILED");
  if (restoreOnly)
    requireRecovery(
      (await loadRecoveryBundle(workspace, bundleDirectory)).fingerprint ===
        validatedBundle.fingerprint,
      "BACKUP_CHANGED_DURING_CHECK",
    );
} catch (error) {
  failure = { stage, code: error.recoveryCode ?? "RECOVERY_FAILED" };
} finally {
  if (source) {
    try {
      await source.end();
    } catch {
      cleanupErrors.push("source_connection");
    }
  }
  sourceStorage?.destroy();
  progress("cleanup_owned_restore_resources");
  for (const name of [...ownedNames].reverse()) {
    try {
      const resource = await inspect(name);
      const id = assertOwnedResource(resource, runId);
      await docker(["rm", "--force", id]);
    } catch {
      cleanupErrors.push(name);
    }
  }
  if (networkId) {
    try {
      const network = JSON.parse(
        await docker(["network", "inspect", networkId]),
      )[0];
      await docker(["network", "rm", assertOwnedResource(network, runId)]);
    } catch {
      cleanupErrors.push("restore_network");
    }
  }
}
const report = {
  status: failure || cleanupErrors.length ? "failed" : "ok",
  runId,
  backupDirectory: bundleDirectory,
  checkedAt: new Date().toISOString(),
  result,
  failure,
  cleanupVerified: cleanupErrors.length === 0,
  cleanupErrors,
  sourceModified: false,
  backupContainsSensitiveData: true,
  mode: restoreOnly ? "existing_backup_only" : "capture_and_restore",
  sourceAccessRequired: !restoreOnly,
  backupUnchanged: restoreOnly && !failure ? true : undefined,
  verificationPath: reportDirectory
    ? resolve(reportDirectory, "verification.json")
    : undefined,
};
if (bundleDirectory && (!restoreOnly || reportDirectory))
  await writeFile(
    resolve(
      restoreOnly ? reportDirectory : bundleDirectory,
      "verification.json",
    ),
    JSON.stringify(report, null, 2),
    { flag: "wx", mode: 0o600 },
  );
console.log(JSON.stringify(report, null, 2));
if (report.status !== "ok") process.exitCode = 1;
