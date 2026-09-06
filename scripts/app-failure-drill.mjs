import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  assertDrillOwnership,
  assertDrillIsolation,
} from "./app-drill-safety.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const executable =
  process.platform === "win32"
    ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe"
    : "docker";
const run = randomUUID();
const prefix = `app-drill-${run}`;
const label = `app-failure-drill.run=${run}`;
const images = {
  postgres:
    "postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2",
  redis:
    "redis@sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576",
  minio:
    "quay.io/minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e",
  clamav:
    "clamav/clamav@sha256:f0954d679017eb6d48221e2b2be3ac5457bf278a844f39b672376f55a085f591",
  api: "sha256:ac92aedf39f151cec7687cfa64b67f6a7330fe8097dfaf74b706541a7189f94a",
};
const secret = () => randomBytes(32).toString("hex");
const pgPassword = secret(),
  redisPassword = secret(),
  storagePassword = secret();
const appEnv = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  API_PORT: "4000",
  WEB_ORIGIN: "http://drill-web",
  TRUST_PROXY_HOPS: "0",
  AUTH_HASH_SECRET: secret(),
  METRICS_TOKEN: secret(),
  DATABASE_URL: `postgresql://drill:${pgPassword}@drill-postgres:5432/drill`,
  REDIS_URL: `redis://:${redisPassword}@drill-redis:6379`,
  S3_ENDPOINT: "http://drill-minio:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "drill-assets",
  S3_ACCESS_KEY: "drill",
  S3_SECRET_KEY: storagePassword,
  S3_FORCE_PATH_STYLE: "true",
  CLAMAV_HOST: "drill-clamav",
  CLAMAV_PORT: "3310",
  GEOCODING_DATA_SHARING_APPROVED: "false",
  GEOCODING_BASE_URL: "",
  EXTERNAL_ALERT_DELIVERY_APPROVED: "false",
  DRILL_LOGIN_PASSWORD: `Drill!${secret()}`,
};
const childEnv = {
  ...process.env,
  ...appEnv,
  POSTGRES_PASSWORD: pgPassword,
  REDIS_PASSWORD: redisPassword,
  MINIO_ROOT_PASSWORD: storagePassword,
};
const containers = [],
  volumes = [];
const observations = [],
  cleanupErrors = [];
let network,
  stage = "preflight",
  failure,
  waitingForReadiness = false;
function progress(value) {
  stage = value;
  console.log(JSON.stringify({ stage }));
}
async function docker(args, timeout = 60000) {
  try {
    return (
      await promisify(execFile)(executable, args, {
        cwd: root,
        env: childEnv,
        windowsHide: true,
        timeout,
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout.trim();
  } catch (error) {
    // Only forward sanitized probe reports, never Docker stderr/command (can contain secrets).
    const line = String(error.stdout ?? "")
      .trim()
      .split("\n")
      .at(-1);
    try {
      const value = JSON.parse(line);
      if (value.action && value.passed === false)
        observations.push({ ...value, readinessPoll: waitingForReadiness });
    } catch {}
    throw new Error("DOCKER_OR_PROBE_FAILED");
  }
}
async function inspect(kind, id) {
  return JSON.parse(await docker([kind, "inspect", id]))[0];
}
async function owned(kind, id) {
  const item = await inspect(kind, id);
  return assertDrillOwnership(kind, item, id, run);
}
const mount = (local, destination) => [
  "--mount",
  `type=bind,source=${resolve(root, local)},target=${destination},readonly`,
];
const envArgs = Object.keys(appEnv).flatMap((key) => ["--env", key]);
async function volume(service) {
  const name = `${prefix}-${service}`;
  await docker(["volume", "create", "--label", label, name]);
  volumes.push(name);
  await owned("volume", name);
  return name;
}
async function create(service, args) {
  const id = await docker([
    "create",
    "--pull=never",
    "--name",
    `${prefix}-${service}`,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    `drill-${service}`,
    "--security-opt",
    "no-new-privileges:true",
    ...args,
  ]);
  containers.push(id);
  const info = await owned("container", id);
  assertDrillIsolation(info, `${prefix}-network`);
  await docker(["start", id]);
  return id;
}
async function mutate(id, verb) {
  await owned("container", id);
  await docker([verb, ...(verb === "stop" ? ["--time", "2"] : []), id]);
}
async function waitFor(check, attempts = 30) {
  waitingForReadiness = true;
  try {
    for (let i = 0; i < attempts; i++) {
      try {
        return await check();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("READINESS_TIMEOUT");
  } finally {
    waitingForReadiness = false;
  }
}
let probe, api;
async function check(action) {
  const output = await docker([
    "exec",
    probe,
    "node",
    "/app/drill/app-probe.mjs",
    action,
  ]);
  const result = JSON.parse(output.split("\n").at(-1));
  if (!result.passed) throw new Error("PROBE_FAILED");
  observations.push(result);
  console.log(JSON.stringify(result));
}
try {
  if (process.argv.length !== 2) throw new Error("NO_ARGUMENTS_ALLOWED");
  if (!existsSync(resolve(root, "apps/api/dist/main.js")))
    throw new Error("BUILD_API_FIRST");
  // No source .env, backups, source containers or application data volumes are read.
  for (const value of Object.values(images))
    await docker(["image", "inspect", value, "--format", "{{.Id}}"]);
  network = await docker([
    "network",
    "create",
    "--internal",
    "--label",
    label,
    `${prefix}-network`,
  ]);
  if (!(await owned("network", network)).Internal)
    throw new Error("NETWORK_NOT_INTERNAL");
  progress("isolated-infrastructure");
  const pgVolume = await volume("postgres");
  const db = await create("postgres", [
    "--env",
    "POSTGRES_DB=drill",
    "--env",
    "POSTGRES_USER=drill",
    "--env",
    "POSTGRES_PASSWORD",
    "--mount",
    `type=volume,source=${pgVolume},target=/var/lib/postgresql`,
    images.postgres,
  ]);
  const redisVolume = await volume("redis");
  const redis = await create("redis", [
    "--env",
    "REDIS_PASSWORD",
    "--mount",
    `type=volume,source=${redisVolume},target=/data`,
    images.redis,
    "sh",
    "-c",
    'exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"',
  ]);
  const storageVolume = await volume("minio");
  const storage = await create("minio", [
    "--env",
    "MINIO_ROOT_USER=drill",
    "--env",
    "MINIO_ROOT_PASSWORD",
    "--mount",
    `type=volume,source=${storageVolume},target=/data`,
    images.minio,
    "server",
    "/data",
  ]);
  const scanner = await create("clamav", [
    "--entrypoint",
    "clamd",
    "--tmpfs",
    "/var/lib/clamav",
    ...mount("infrastructure/drill", "/drill"),
    images.clamav,
    "--config-file=/drill/clamd.conf",
  ]);
  await waitFor(() =>
    docker(["exec", db, "pg_isready", "-U", "drill", "-d", "drill"]),
  );
  await waitFor(() =>
    docker([
      "exec",
      storage,
      "curl",
      "-fsS",
      "http://localhost:9000/minio/health/live",
    ]),
  );
  probe = await create("probe", [
    ...envArgs,
    "--workdir",
    "/app",
    ...mount("infrastructure/drill", "/app/drill"),
    ...mount("packages/db/prisma/migrations", "/migrations"),
    images.api,
    "node",
    "-e",
    "setInterval(()=>{},1000)",
  ]);
  progress("synthetic-data");
  await check("seed");
  api = await create("api", [
    ...envArgs,
    ...mount("apps/api/dist", "/app/apps/api/dist"),
    images.api,
  ]);
  await waitFor(() => check("healthy"));
  const startedAt = (await owned("container", api)).State.StartedAt;
  progress("postgres-outage");
  await mutate(db, "stop");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await check("db-down");
  await mutate(db, "start");
  await waitFor(() => check("healthy"));
  progress("redis-outage");
  await mutate(redis, "stop");
  await check("redis-down");
  await mutate(redis, "start");
  await waitFor(() => check("healthy"));
  progress("storage-outage");
  await check("queue-storage");
  await mutate(storage, "stop");
  await check("storage-down");
  await check("retry");
  await mutate(storage, "start");
  await check("image-ready");
  await waitFor(() => check("healthy"));
  progress("scanner-outage");
  await mutate(scanner, "stop");
  await check("scanner-down");
  await check("queue-scanner");
  await check("retry");
  await mutate(scanner, "start");
  await check("image-ready");
  await waitFor(() => check("healthy"));
  const final = await owned("container", api);
  if (
    !final.State.Running ||
    final.State.StartedAt !== startedAt ||
    final.RestartCount !== 0
  )
    throw new Error("API_RESTARTED");
  observations.push({ action: "api-survived-without-restart", passed: true });
} catch (error) {
  failure = { stage, code: error.message };
  if (probe && stage === "postgres-outage") {
    try {
      await check("database-error-shape");
    } catch {}
  }
  if (api) {
    try {
      const info = await owned("container", api);
      observations.push({
        action: "api-failure-state",
        running: info.State.Running,
        exitCode: info.State.ExitCode,
        oomKilled: info.State.OOMKilled,
        restartCount: info.RestartCount,
      });
    } catch {}
  }
} finally {
  progress("cleanup-owned-resources");
  for (const id of [...containers].reverse()) {
    try {
      await owned("container", id);
      await docker(["rm", "--force", "--volumes", id]);
    } catch {
      cleanupErrors.push("container");
    }
  }
  for (const name of [...volumes].reverse()) {
    try {
      await owned("volume", name);
      await docker(["volume", "rm", name]);
    } catch {
      cleanupErrors.push("volume");
    }
  }
  if (network) {
    try {
      await owned("network", network);
      await docker(["network", "rm", network]);
    } catch {
      cleanupErrors.push("network");
    }
  }
  const report = {
    run,
    checkedAt: new Date().toISOString(),
    passed: !failure && !cleanupErrors.length,
    failure,
    observations,
    cleanupErrors,
    cleanupCompleted: cleanupErrors.length === 0,
    sourceDataAccessed: false,
    publishedPorts: 0,
    externalNetwork: false,
    scannerDefinitions: "synthetic-test-only",
    images,
  };
  const directory = resolve(root, ".artifacts", prefix);
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
  if (!report.passed) process.exitCode = 1;
}
