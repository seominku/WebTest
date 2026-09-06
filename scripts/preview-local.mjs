import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  assertOwned,
  assertIsolated,
  validRun,
  quickOrigin,
  labelKey,
} from "./preview-safety.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = resolve(root, ".artifacts");
const statusFile = resolve(artifacts, "preview-status.json");
const executable = "C:/Program Files/Docker/Docker/resources/bin/docker.exe";
const tunnelExe = "C:/Program Files (x86)/cloudflared/cloudflared.exe";
const mode = process.argv[2];
if (mode === "--stop") {
  const state = JSON.parse(await readFile(statusFile, "utf8"));
  const directory = resolve(artifacts, `preview-${validRun(state.run)}`);
  await writeFile(resolve(directory, "STOP"), "Stop requested by owner\n");
  console.log(
    "Stop requested; the supervisor will close only this preview tunnel and containers. Test volumes are retained.",
  );
  process.exit(0);
}
assert.equal(mode, "--serve", "Use --serve or --stop");
const run = randomUUID(),
  prefix = `property-preview-${run}`,
  networkName = `${prefix}-network`;
const directory = resolve(artifacts, `preview-${run}`);
const secret = () => randomBytes(24).toString("base64url");
const pgPassword = secret(),
  redisPassword = secret(),
  storagePassword = secret();
const gatePassword = secret(),
  appPassword = `Test!${secret()}`;
const images = {
  postgres:
    "postgres@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2",
  redis:
    "redis@sha256:becdda6c7f4b3fb42e42fd7f120bbf5c54c4caaaf16f26da24e4563d2c1f0576",
  minio:
    "quay.io/minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e",
  clamav:
    "clamav/clamav@sha256:f0954d679017eb6d48221e2b2be3ac5457bf278a844f39b672376f55a085f591",
  caddy:
    "caddy@sha256:5f5c8640aae01df9654968d946d8f1a56c497f1dd5c5cda4cf95ab7c14d58648",
  api: "sha256:6e68b38bb3606fd467dc87d6a1360f7255316a880fb6acdd44bb0165eb7a469e",
  web: "real-estate-preview-web:20260906",
};
const appEnv = {
  APP_ENV: "production",
  NODE_ENV: "production",
  API_PORT: "4000",
  WEB_ORIGIN: "https://pending.invalid",
  TRUST_PROXY_HOPS: "1",
  AUTH_HASH_SECRET: secret(),
  METRICS_TOKEN: secret(),
  DATABASE_URL: `postgresql://preview:${pgPassword}@preview-postgres:5432/preview`,
  REDIS_URL: `redis://:${redisPassword}@preview-redis:6379`,
  S3_ENDPOINT: "http://preview-minio:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "preview-assets",
  S3_ACCESS_KEY: "preview",
  S3_SECRET_KEY: storagePassword,
  S3_FORCE_PATH_STYLE: "true",
  CLAMAV_HOST: "preview-clamav",
  CLAMAV_PORT: "3310",
  GEOCODING_DATA_SHARING_APPROVED: "false",
  GEOCODING_BASE_URL: "",
  EXTERNAL_ALERT_DELIVERY_APPROVED: "false",
};
const childEnv = {
  ...process.env,
  ...appEnv,
  POSTGRES_PASSWORD: pgPassword,
  REDIS_PASSWORD: redisPassword,
  MINIO_ROOT_PASSWORD: storagePassword,
  PREVIEW_SEED_APPROVED: "synthetic-only",
  PREVIEW_APP_PASSWORD: appPassword,
};
const containers = [],
  volumes = [],
  checks = [];
let network,
  ingress,
  tunnel,
  origin,
  stage = "preflight",
  started = false,
  tunnelExited = false;
let expiresAt,
  stopping = false;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () => ({
  run,
  stage,
  origin,
  expiresAt,
  accessFile: resolve(directory, "access.txt"),
  containers,
  volumes,
  network,
  ingress,
  checks,
  supervisorPid: process.pid,
});
async function progress(next) {
  stage = next;
  await writeFile(statusFile, JSON.stringify(state(), null, 2));
  await writeFile(
    resolve(directory, "status.json"),
    JSON.stringify(state(), null, 2),
  );
  console.log(JSON.stringify({ stage, at: new Date().toISOString() }));
}
async function docker(args, input, timeout = 60000) {
  return new Promise((res, rej) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: childEnv,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      rej(new Error("DOCKER_TIMEOUT"));
    }, timeout);
    child.stdout.on("data", (data) => {
      out += data;
    });
    // Never print a command/environment/stderr: infrastructure credentials must stay local.
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      rej(new Error("DOCKER_START_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? res(out.trim()) : rej(new Error("DOCKER_FAILED"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
async function owned(kind, id) {
  return assertOwned(
    kind,
    JSON.parse(await docker([kind, "inspect", id]))[0],
    id,
    run,
  );
}
async function volume(service) {
  const name = `${prefix}-${service}`;
  await docker(["volume", "create", "--label", `${labelKey}=${run}`, name]);
  volumes.push(name);
  await owned("volume", name);
  return name;
}
const bind = (local, target) => [
  "--mount",
  `type=bind,source=${resolve(root, local)},target=${target},readonly`,
];
const envArgs = Object.keys(appEnv).flatMap((key) => ["--env", key]);
async function create(service, args, gateway = false) {
  const id = await docker([
    "create",
    "--pull=never",
    "--name",
    `${prefix}-${service}`,
    "--label",
    `${labelKey}=${run}`,
    "--network",
    network,
    "--network-alias",
    `preview-${service}`,
    "--security-opt",
    "no-new-privileges:true",
    ...args,
  ]);
  containers.push(id);
  if (gateway) {
    await owned("container", id);
    await owned("network", ingress);
    await docker(["network", "connect", ingress, id]);
    const authFile = resolve(directory, "preview-auth.caddy");
    await writeFile(authFile, `preview ${childEnv.PREVIEW_PASSWORD_HASH}\n`);
    await docker(["cp", authFile, `${id}:/data/preview-auth.caddy`]);
  }
  assertIsolated(await owned("container", id), networkName, gateway);
  await docker(["start", id]);
  return id;
}
async function waitFor(check, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    if (stopping || existsSync(resolve(directory, "STOP")))
      throw new Error("STOP_REQUESTED");
    try {
      return await check();
    } catch {
      await delay(1000);
    }
  }
  throw new Error("READINESS_TIMEOUT");
}
async function request(base, path, options = {}, auth = true) {
  return fetch(`${base}${path}`, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(auth
        ? {
            Authorization: `Basic ${Buffer.from(`preview:${gatePassword}`).toString("base64")}`,
          }
        : {}),
      ...options.headers,
    },
  });
}
async function gateChecks(base) {
  for (const path of [
    "/",
    "/listings",
    "/_next/static/test.js",
    "/api/v1/listings",
    "/api/v1/health/ready",
    "/api/v1/listings/test/images/test/content",
  ]) {
    const response = await request(base, path, {}, false);
    assert.equal(response.status, 401);
    await response.arrayBuffer();
  }
  const wrong = await request(
    base,
    "/",
    { headers: { Authorization: "Basic cHJldmlldzp3cm9uZw==" } },
    false,
  );
  assert.equal(wrong.status, 401);
  await wrong.arrayBuffer();
  assert.equal(
    (await request(base, "/api/v1/auth/register", { method: "POST" })).status,
    404,
  );
  assert.equal((await request(base, "/api/v1/metrics")).status, 404);
  checks.push({
    name: base.startsWith("https")
      ? "public-password-gate"
      : "local-password-gate",
    passed: true,
  });
}
async function verifyPublic() {
  await gateChecks(origin);
  const home = await request(origin, "/");
  assert.equal(home.status, 200);
  assert.match(home.headers.get("cache-control"), /no-store/);
  const html = await home.text();
  assert.ok(!html.includes("http://localhost:4000"));
  const list = await request(origin, "/api/v1/listings");
  assert.equal(list.status, 200);
  const listings = (await list.json()).items;
  assert.equal(listings.length, 3);
  assert.ok(listings.every((item) => item.title.startsWith("[가상 테스트]")));
  const detail = await (
    await request(origin, `/api/v1/listings/${listings[0].id}`)
  ).json();
  const photo = await request(origin, `/api/v1${detail.imagePaths[0]}`);
  assert.equal(photo.status, 200);
  assert.match(photo.headers.get("content-type"), /image\/webp/);
  await photo.arrayBuffer();
  const login = await request(origin, "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({
      email: "agent@example.test",
      password: appPassword,
    }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /^__Host-re\.sid=/);
  assert.match(cookie, /; Secure/i);
  assert.match(cookie, /; HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const { csrfToken } = await login.json();
  const sessionHeaders = {
    Cookie: cookie.split(";")[0],
    "Content-Type": "application/json",
    Origin: origin,
  };
  assert.equal(
    (await request(origin, "/api/v1/auth/me", { headers: sessionHeaders }))
      .status,
    200,
  );
  assert.equal(
    (
      await request(origin, "/api/v1/auth/logout", {
        method: "POST",
        headers: sessionHeaders,
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(origin, "/api/v1/auth/logout", {
        method: "POST",
        headers: {
          ...sessionHeaders,
          Origin: "https://untrusted.invalid",
          "x-csrf-token": csrfToken,
        },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(origin, "/api/v1/auth/logout", {
        method: "POST",
        headers: { ...sessionHeaders, "x-csrf-token": csrfToken },
        body: "{}",
      })
    ).status,
    200,
  );
  checks.push({
    name: "public-home-synthetic-listings-photo-secure-login-origin-csrf",
    passed: true,
  });
}
async function cleanup() {
  stopping = true;
  if (tunnel && !tunnelExited) {
    const closed = new Promise((resolveClose) =>
      tunnel.once("exit", resolveClose),
    );
    tunnel.kill();
    await Promise.race([closed, delay(5000)]);
  }
  const failed = [];
  for (const id of [...containers].reverse()) {
    try {
      await owned("container", id);
      await docker(["rm", "--force", id]);
    } catch {
      failed.push(id);
    }
  }
  if (network) {
    try {
      await owned("network", network);
      await docker(["network", "rm", network]);
    } catch {
      failed.push(network);
    }
  }
  if (ingress) {
    try {
      await owned("network", ingress);
      await docker(["network", "rm", ingress]);
    } catch {
      failed.push(ingress);
    }
  }
  // Retain explicitly named test volumes, including user-entered test uploads. No recursive filesystem deletion.
  checks.push({
    name: "cleanup-containers-network",
    passed: failed.length === 0,
    remaining: failed,
  });
}
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
try {
  if (existsSync(statusFile)) {
    const previous = JSON.parse(await readFile(statusFile, "utf8"));
    assert.ok(
      ["stopped", "failed"].includes(previous.stage),
      "PREVIEW_ALREADY_EXISTS",
    );
  }
  await mkdir(directory, { recursive: true });
  // Apply restrictive inheritance to this NEW credential folder before writing any secret.
  const escaped = directory.replaceAll("'", "''");
  await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `$ErrorActionPreference='Stop'; $previewAcl=New-Object System.Security.AccessControl.DirectorySecurity; $previewAcl.SetAccessRuleProtection($true,$false); $previewSid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; foreach($previewIdentity in @($previewSid.Value,'S-1-5-18','S-1-5-32-544')) { $previewRule=New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier($previewIdentity)),'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $previewAcl.AddAccessRule($previewRule) }; Set-Acl -LiteralPath '${escaped}' -AclObject $previewAcl`,
    ],
    { windowsHide: true },
  );
  started = true;
  await progress("preflight");
  for (const value of Object.values(images))
    await docker(["image", "inspect", value, "--format", "{{.Id}}"]);
  assert.ok(existsSync(tunnelExe));
  network = await docker([
    "network",
    "create",
    "--internal",
    "--label",
    `${labelKey}=${run}`,
    networkName,
  ]);
  assert.equal((await owned("network", network)).Internal, true);
  ingress = await docker([
    "network",
    "create",
    "--label",
    `${labelKey}=${run}`,
    `${prefix}-ingress`,
  ]);
  await owned("network", ingress);
  await progress("isolated-infrastructure");
  const db = await create("postgres", [
    "--env",
    "POSTGRES_DB=preview",
    "--env",
    "POSTGRES_USER=preview",
    "--env",
    "POSTGRES_PASSWORD",
    "--mount",
    `type=volume,source=${await volume("postgres")},target=/var/lib/postgresql`,
    images.postgres,
  ]);
  const redis = await create("redis", [
    "--env",
    "REDIS_PASSWORD",
    "--mount",
    `type=volume,source=${await volume("redis")},target=/data`,
    images.redis,
    "sh",
    "-c",
    'exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"',
  ]);
  const storage = await create("minio", [
    "--env",
    "MINIO_ROOT_USER=preview",
    "--env",
    "MINIO_ROOT_PASSWORD",
    "--mount",
    `type=volume,source=${await volume("minio")},target=/data`,
    images.minio,
    "server",
    "/data",
  ]);
  const scanner = await create("clamav", [
    "--entrypoint",
    "clamd",
    "--mount",
    `type=volume,source=${await volume("clamav")},target=/var/lib/clamav`,
    ...bind("infrastructure/preview/clamd.conf", "/preview-clamd.conf"),
    images.clamav,
    "--config-file=/preview-clamd.conf",
  ]);
  await waitFor(() =>
    docker(["exec", db, "pg_isready", "-U", "preview", "-d", "preview"]),
  );
  await waitFor(() =>
    docker([
      "exec",
      redis,
      "sh",
      "-c",
      'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping',
    ]),
  );
  await waitFor(() =>
    docker([
      "exec",
      storage,
      "curl",
      "--fail",
      "--silent",
      "http://127.0.0.1:9000/minio/health/live",
    ]),
  );
  await waitFor(
    () =>
      docker([
        "exec",
        scanner,
        "clamdscan",
        "--config-file=/preview-clamd.conf",
        "--ping=1",
      ]),
    150,
  );
  checks.push({ name: "isolated-dependencies-real-clamav", passed: true });
  await progress("seed-synthetic-data");
  const seed = await create("seed", [
    ...envArgs,
    "--env",
    "PREVIEW_APP_PASSWORD",
    "--env",
    "PREVIEW_SEED_APPROVED",
    ...bind("infrastructure/preview/seed.mjs", "/app/preview/seed.mjs"),
    ...bind("packages/db/prisma/migrations", "/migrations"),
    ...bind("apps/web/public/sample-listings", "/samples"),
    "--workdir",
    "/app",
    "--entrypoint",
    "node",
    images.api,
    "/app/preview/seed.mjs",
  ]);
  assert.equal(await docker(["wait", seed], undefined, 120000), "0");
  checks.push(JSON.parse(await docker(["logs", seed])));
  await progress("protect-loopback-gateway");
  childEnv.PREVIEW_PASSWORD_HASH = await docker(
    [
      "run",
      "--rm",
      "--interactive",
      "--network",
      "none",
      images.caddy,
      "caddy",
      "hash-password",
      "--algorithm",
      "bcrypt",
      "--bcrypt-cost",
      "12",
    ],
    gatePassword + "\n",
  );
  assert.match(childEnv.PREVIEW_PASSWORD_HASH, /^\$2[aby]\$/);
  const gateway = await create(
    "gateway",
    [
      "--publish",
      "127.0.0.1:4310:8080",
      "--env",
      "PREVIEW_PASSWORD_HASH",
      ...bind("infrastructure/preview/Caddyfile", "/etc/caddy/Caddyfile"),
      "--mount",
      `type=volume,source=${await volume("caddy-data")},target=/data`,
      "--mount",
      `type=volume,source=${await volume("caddy-config")},target=/config`,
      images.caddy,
    ],
    true,
  );
  await waitFor(() => gateChecks("http://127.0.0.1:4310"), 20);
  await progress("start-protected-https-tunnel");
  tunnel = spawn(
    tunnelExe,
    [
      "tunnel",
      "--no-autoupdate",
      "--protocol",
      "http2",
      "--url",
      "http://127.0.0.1:4310",
    ],
    { cwd: directory, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  const collect = (data) => {
    const match = String(data).match(
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/,
    );
    if (match) origin = quickOrigin(match[0]);
  };
  tunnel.stdout.on("data", collect);
  tunnel.stderr.on("data", collect);
  tunnel.on("error", () => {
    tunnelExited = true;
  });
  tunnel.on("exit", () => {
    tunnelExited = true;
  });
  await waitFor(() => {
    if (tunnelExited || !origin) throw new Error("NO_TUNNEL");
    return origin;
  }, 90);
  appEnv.WEB_ORIGIN = origin;
  childEnv.WEB_ORIGIN = origin;
  await progress("start-same-origin-app");
  const api = await create("api", [...envArgs, images.api]);
  await waitFor(() =>
    docker([
      "exec",
      api,
      "node",
      "-e",
      "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))",
    ]),
  );
  await create("web", [
    "--env",
    "API_INTERNAL_BASE_URL=http://preview-api:4000/api/v1",
    images.web,
  ]);
  await waitFor(async () => {
    assert.equal((await request(origin, "/")).status, 200);
  }, 60);
  await progress("verify-public-https");
  await verifyPublic();
  expiresAt = new Date(Date.now() + 4 * 3600000).toISOString();
  await writeFile(
    resolve(directory, "access.txt"),
    `임시 외부 테스트 사이트 (실제 매물/개인정보 입력 금지)\n\n주소: ${origin}\n\n1. 브라우저 접속 암호창\n사용자 이름: preview\n암호: ${gatePassword}\n\n2. 사이트 내부 로그인 (필요할 때만)\n중개사: agent@example.test\n일반 회원: viewer@example.test\n사이트 로그인 암호: ${appPassword}\n\n자동 종료: ${new Date(expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST\n컴퓨터와 Docker가 켜져 있어야 합니다.\n즉시 종료: 프로젝트 폴더에서 npm.cmd run preview:stop\n이 파일은 접속 정보이므로 공개 저장소/채팅/스크린샷에 공유하지 마세요.\n`,
  );
  await progress("ready");
  while (
    !stopping &&
    !tunnelExited &&
    Date.now() < Date.parse(expiresAt) &&
    !existsSync(resolve(directory, "STOP"))
  )
    await delay(1000);
  await progress("stopping");
  await cleanup();
  await progress("stopped");
} catch (error) {
  if (started) {
    checks.push({
      name: "failed-stage",
      stage,
      code: [
        "DOCKER_FAILED",
        "DOCKER_TIMEOUT",
        "READINESS_TIMEOUT",
        "STOP_REQUESTED",
      ].includes(error.message)
        ? error.message
        : "PREVIEW_CHECK_FAILED",
    });
    await cleanup();
    await progress("failed");
  }
  console.error(
    "PREVIEW_FAILED: consult .artifacts/preview-status.json (no credentials logged)",
  );
  process.exitCode = 1;
}
