import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { promisify, parseEnv } from "node:util";
import { checkOperations } from "./operations-check.mjs";
import {
  canonicalMounts,
  changedEnvironmentKeys,
} from "./deploy-api-local-safety.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const executable =
  process.platform === "win32"
    ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe"
    : "docker";
const run = randomUUID();
const directory = resolve(root, ".artifacts", `api-deploy-${run}`);
const rollbackFile = resolve(directory, "rollback.compose.json");
const beforeTag = `real-estate-platform-api:rollback-${run}`;
const events = [];
let stage = "preflight",
  previous,
  candidate,
  rollbackImage,
  switched = false,
  rollback,
  environment,
  compose,
  beforeFootprint;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function requireDeploy(condition, code) {
  if (!condition) throw new Error(code);
}
function progress(value) {
  stage = value;
  console.log(JSON.stringify({ stage }));
}
async function command(file, args, options = {}) {
  try {
    return (
      await promisify(execFile)(file, args, {
        cwd: root,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 16 * 1024 * 1024,
        ...options,
      })
    ).stdout.trim();
  } catch {
    throw new Error("COMMAND_FAILED");
  }
}
const docker = (args, options) => command(executable, args, options);
const dc = (args, options) => docker([...compose, ...args], options);
const inspect = async (id) => JSON.parse(await docker(["inspect", id]))[0];
async function preserveRollbackImage() {
  const imageIds = (
    await docker(["image", "ls", "-a", "--no-trunc", "--quiet"])
  ).split(/\s+/);
  if (imageIds.includes(previous.Image)) {
    await docker(["image", "tag", previous.Image, beforeTag]);
    rollbackImage = previous.Image;
    return;
  }
  progress("preserve-running-rootfs-without-environment");
  requireDeploy(
    previous.Mounts.length === 0 &&
      (await docker(["diff", previous.Id])) === "",
    "ROLLBACK_ROOTFS_NOT_CLEAN",
  );
  requireDeploy(
    previous.Config.User === "nestjs" &&
      previous.Config.WorkingDir === "/app/apps/api" &&
      JSON.stringify(previous.Config.Cmd) ===
        JSON.stringify(["node", "dist/main.js"]) &&
      JSON.stringify(previous.Config.Entrypoint) ===
        JSON.stringify(["docker-entrypoint.sh"]),
    "UNEXPECTED_RUNTIME_CONFIG",
  );
  const check = `const fs=require('fs'); if(['/app/.env','/app/apps/api/.env'].some(p=>fs.existsSync(p)))process.exit(2); console.log('no-env-files');`;
  requireDeploy(
    (await docker(["exec", previous.Id, "node", "-e", check])) ===
      "no-env-files",
    "ENV_FILE_IN_ROOTFS",
  );
  const recoveredTag = `real-estate-platform-api:recovered-${previous.Image.slice(7)}`;
  const cached = await docker([
    "image",
    "ls",
    "--quiet",
    "--no-trunc",
    "--filter",
    `reference=${recoveredTag}`,
  ]);
  if (cached) {
    const signature = `const fs=require('fs'),path=require('path'),crypto=require('crypto');const hash=crypto.createHash('sha256');
      function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(entry.isFile()){hash.update(p);hash.update(fs.readFileSync(p));}}}
      walk('/app/apps/api/dist');walk('/app/packages/db/dist');console.log(hash.digest('hex'));`;
    const snapshot = await inspect(cached);
    requireDeploy(
      Object.keys(envObject(snapshot.Config.Env)).every((key) =>
        ["PATH", "NODE_ENV"].includes(key),
      ),
      "ROLLBACK_ENV_NOT_SANITIZED",
    );
    const sourceSignature = await docker([
      "exec",
      previous.Id,
      "node",
      "-e",
      signature,
    ]);
    const cachedSignature = await docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--label",
      `api-deploy.run=${run}`,
      "--entrypoint",
      "node",
      cached,
      "-e",
      signature,
    ]);
    requireDeploy(
      sourceSignature === cachedSignature,
      "RECOVERED_CODE_MISMATCH",
    );
    await docker(["image", "tag", cached, beforeTag]);
    rollbackImage = snapshot.Id;
    events.push({
      step: "rollback-rootfs-reused",
      originalImageMissing: true,
      compiledCodeMatched: true,
      runtimeEnvironmentExcluded: true,
      image: rollbackImage,
    });
    return;
  }
  // Binary stream, no PowerShell text pipe, disk archive, container pause or runtime ENV snapshot.
  await new Promise((resolvePromise, reject) => {
    const source = spawn(executable, ["export", previous.Id], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const target = spawn(
      executable,
      [
        "import",
        "--change",
        "ENV NODE_ENV=production",
        "--change",
        "ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "--change",
        "WORKDIR /app/apps/api",
        "--change",
        "USER nestjs",
        "--change",
        'ENTRYPOINT ["docker-entrypoint.sh"]',
        "--change",
        'CMD ["node","dist/main.js"]',
        "-",
        beforeTag,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    source.stdout.pipe(target.stdin);
    source.stderr.resume();
    target.stdout.resume();
    target.stderr.resume();
    let sourceCode,
      targetCode,
      settled = false;
    const timer = setTimeout(
      () => finish(new Error("ROLLBACK_SNAPSHOT_TIMEOUT")),
      180000,
    );
    const finish = (error) => {
      if (settled) return;
      if (!error && (sourceCode === undefined || targetCode === undefined))
        return;
      settled = true;
      clearTimeout(timer);
      if (error || sourceCode !== 0 || targetCode !== 0) {
        source.kill();
        target.kill();
        reject(error ?? new Error("ROLLBACK_SNAPSHOT_FAILED"));
      } else resolvePromise();
    };
    source.on("error", () => finish(new Error("ROLLBACK_EXPORT_FAILED")));
    target.on("error", () => finish(new Error("ROLLBACK_IMPORT_FAILED")));
    target.stdin.on("error", () => finish(new Error("ROLLBACK_PIPE_FAILED")));
    source.on("close", (code) => {
      sourceCode = code;
      finish();
    });
    target.on("close", (code) => {
      targetCode = code;
      finish();
    });
  });
  const snapshot = await inspect(beforeTag);
  rollbackImage = snapshot.Id;
  const snapshotEnv = envObject(snapshot.Config.Env);
  requireDeploy(
    Object.keys(snapshotEnv).every((key) => ["PATH", "NODE_ENV"].includes(key)),
    "ROLLBACK_ENV_NOT_SANITIZED",
  );
  requireDeploy(
    (await docker([
      "run",
      "--rm",
      "--network",
      "none",
      "--label",
      `api-deploy.run=${run}`,
      "--entrypoint",
      "node",
      rollbackImage,
      "-e",
      check,
    ])) === "no-env-files",
    "ROLLBACK_IMAGE_CHECK_FAILED",
  );
  events.push({
    step: "rollback-rootfs-preserved",
    originalImageMissing: true,
    runtimeEnvironmentExcluded: true,
    image: rollbackImage,
  });
  await docker(["image", "tag", rollbackImage, recoveredTag]);
}
function envObject(lines) {
  return Object.fromEntries(
    lines.map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
  );
}
async function currentApi() {
  const id = await dc(["ps", "-q", "api"]);
  requireDeploy(/^[a-f0-9]{64}$/.test(id), "EXPECTED_ONE_RUNNING_API");
  const item = await inspect(id);
  requireDeploy(
    item.Config.Labels["com.docker.compose.project"] ===
      "real-estate-platform" &&
      item.Config.Labels["com.docker.compose.service"] === "api",
    "API_OWNERSHIP_MISMATCH",
  );
  return item;
}
async function footprint() {
  const ids = (await dc(["ps", "-a", "-q"])).split(/\s+/).filter(Boolean);
  const result = [];
  for (const id of ids) {
    const item = await inspect(id);
    const service = item.Config.Labels["com.docker.compose.service"];
    if (service !== "api")
      result.push({
        service,
        id: item.Id,
        image: item.Image,
        startedAt: item.State.StartedAt,
        mounts: canonicalMounts(item.Mounts),
      });
  }
  return result.sort((a, b) => a.service.localeCompare(b.service));
}
async function waitHealthy(image) {
  for (let i = 0; i < 30; i++) {
    try {
      const item = await currentApi();
      if (item.Image === image && item.State.Health?.Status === "healthy") {
        const response = await fetch(
          `http://127.0.0.1:${environment.API_PORT ?? 4000}/api/v1/health/ready`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (response.status === 200) return item;
      }
    } catch {}
    await pause(2000);
  }
  throw new Error("API_NOT_READY");
}
async function publicIds() {
  const response = await fetch(
    `http://127.0.0.1:${environment.API_PORT ?? 4000}/api/v1/listings?pageSize=50`,
    { signal: AbortSignal.timeout(10000) },
  );
  requireDeploy(response.status === 200, "PUBLIC_LISTINGS_UNAVAILABLE");
  const body = await response.json();
  requireDeploy(Array.isArray(body.items), "INVALID_PUBLIC_LISTINGS");
  // Compare existing first-page identifiers, not a hardcoded seed-data count.
  return {
    total: body.pagination.total,
    ids: body.items.map((item) => item.id).sort(),
  };
}
async function smoke(script) {
  const output = await command(
    process.execPath,
    [resolve(root, "scripts", script)],
    {
      timeout: 120000,
      env: {
        ...process.env,
        ...environment,
        SMOKE_API_BASE_URL: `http://127.0.0.1:${environment.API_PORT ?? 4000}/api/v1`,
        SMOKE_WEB_ORIGIN: `http://localhost:${environment.WEB_PORT ?? 3000}`,
      },
    },
  );
  const result = JSON.parse(output.split("\n").at(-1));
  requireDeploy(
    result.status === "ok" && result.userMatched !== false,
    "SMOKE_FAILED",
  );
  events.push({ step: script, ...result });
  console.log(
    JSON.stringify({
      step: script,
      status: result.status,
      checks: result.checks?.length,
    }),
  );
}
let report;
try {
  requireDeploy(
    process.argv.length === 3 &&
      ["--check", "--apply"].includes(process.argv[2]),
    "USE_CHECK_OR_APPLY",
  );
  environment = parseEnv(await readFile(resolve(root, ".env"), "utf8"));
  for (const key of ["API_PORT", "WEB_PORT", "POSTGRES_PORT"])
    if (environment[key])
      requireDeploy(
        /^\d+$/.test(environment[key]) &&
          +environment[key] > 0 &&
          +environment[key] <= 65535,
        "INVALID_LOCAL_PORT",
      );
  if (environment.DATABASE_URL)
    requireDeploy(
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(environment.DATABASE_URL).hostname,
      ),
      "NONLOCAL_SMOKE_DATABASE",
    );
  const alias =
    process.platform === "win32"
      ? resolve(process.env.TEMP, "real-estate-platform-src")
      : root;
  requireDeploy(
    (await realpath(alias)).toLowerCase() ===
      (await realpath(root)).toLowerCase(),
    "BUILD_ALIAS_MISMATCH",
  );
  compose = [
    "compose",
    "--project-name",
    "real-estate-platform",
    "--project-directory",
    alias,
    "--env-file",
    resolve(root, ".env"),
    "--file",
    resolve(root, "docker-compose.yml"),
  ];
  const config = JSON.parse(await dc(["config", "--format", "json"]));
  const wanted = config.services.api;
  previous = await currentApi();
  const actualEnv = envObject(previous.Config.Env);
  const changedKeys = changedEnvironmentKeys(wanted.environment, actualEnv);
  requireDeploy(
    changedKeys.length === 0,
    `API_ENVIRONMENT_DRIFT:${changedKeys.join(",")}`,
  );
  requireDeploy(
    actualEnv.APP_ENV === "local" &&
      actualEnv.GEOCODING_DATA_SHARING_APPROVED === "false",
    "EXPECTED_LOCAL_NONSHARING_API",
  );
  requireDeploy(
    wanted.ports.every((port) => port.host_ip === "127.0.0.1") &&
      !wanted.volumes?.length,
    "UNEXPECTED_API_PORT_OR_MOUNT",
  );
  const dbPort = config.services.postgres.ports.find(
    (port) => port.target === 5432,
  );
  requireDeploy(dbPort?.host_ip === "127.0.0.1", "EXPECTED_LOOPBACK_DATABASE");
  const smokeDatabase = new URL(wanted.environment.DATABASE_URL);
  requireDeploy(
    smokeDatabase.hostname === "postgres",
    "EXPECTED_COMPOSE_DATABASE",
  );
  smokeDatabase.hostname = "127.0.0.1";
  smokeDatabase.port = String(dbPort.published);
  environment.DATABASE_URL = smokeDatabase.href;
  const beforeOps = await checkOperations({ environment });
  requireDeploy(beforeOps.status === "ok", "PREEXISTING_SERVICE_FAILURE");
  beforeFootprint = await footprint();
  const listings = await publicIds();
  events.push({
    step: "preflight",
    status: "ok",
    operationsChecks: beforeOps.results.length,
    publicListingCount: listings.total,
    unchangedServices: beforeFootprint.map((item) => item.service),
    environmentUnchanged: true,
  });
  console.log(JSON.stringify(events.at(-1)));
  if (process.argv[2] === "--check") {
    report = {
      status: "preflight_passed",
      run,
      previousImage: previous.Image,
      events,
    };
  } else {
    await mkdir(directory, { recursive: true });
    await preserveRollbackImage();
    await writeFile(
      rollbackFile,
      JSON.stringify({ services: { api: { image: beforeTag } } }, null, 2),
      { flag: "wx" },
    );
    await writeFile(
      resolve(directory, "before.json"),
      JSON.stringify(
        {
          image: previous.Image,
          container: previous.Id,
          rollbackImage,
          rollbackTag: beforeTag,
          unaffected: beforeFootprint,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    progress("build-api-only");
    await dc(["build", "api"], { timeout: 900000 });
    candidate = (await inspect("real-estate-platform-api")).Id;
    requireDeploy(
      /^sha256:[a-f0-9]{64}$/.test(candidate),
      "INVALID_CANDIDATE_IMAGE",
    );
    // Check packaged code without network access or application startup.
    progress("verify-packaged-fix");
    const codeCheck = `const fs=require('fs'); const base='/app/apps/api/dist/';
      const files={'listings/listing-image-processing.service.js':'runScheduledProcessing',
      'infrastructure/database-unavailable.filter.js':'DATABASE_TEMPORARILY_UNAVAILABLE',
      'auth/guards/rate-limit.guard.js':'REQUEST_PROTECTION_UNAVAILABLE',
      'configure-app.js':'DatabaseUnavailableFilter'};
      for(const [file, marker] of Object.entries(files)) if(!fs.readFileSync(base+file,'utf8').includes(marker)) process.exit(2);
      console.log('packaged-fix-ok');`;
    requireDeploy(
      (await docker([
        "run",
        "--rm",
        "--network",
        "none",
        "--label",
        `api-deploy.run=${run}`,
        "--entrypoint",
        "node",
        candidate,
        "-e",
        codeCheck,
      ])) === "packaged-fix-ok",
      "PACKAGED_FIX_MISSING",
    );
    // Recheck source container ownership and identity immediately before replacement.
    requireDeploy(
      (await currentApi()).Id === previous.Id,
      "API_CHANGED_DURING_BUILD",
    );
    requireDeploy(
      JSON.stringify(await footprint()) === JSON.stringify(beforeFootprint),
      "DEPENDENCY_CHANGED_DURING_BUILD",
    );
    const refreshed = JSON.parse(await dc(["config", "--format", "json"]));
    requireDeploy(
      JSON.stringify(refreshed.services.api) === JSON.stringify(wanted),
      "API_CONFIG_CHANGED_DURING_BUILD",
    );
    progress("replace-api-only");
    switched = true;
    const switchStarted = Date.now();
    await dc(["up", "-d", "--no-deps", "--no-build", "api"]);
    const deployed = await waitHealthy(candidate);
    events.push({
      step: "api-ready",
      image: candidate,
      container: deployed.Id,
      readinessWaitMs: Date.now() - switchStarted,
    });
    requireDeploy(
      JSON.stringify(await publicIds()) === JSON.stringify(listings),
      "PUBLIC_LISTINGS_CHANGED",
    );
    progress("authentication-and-photo-smoke");
    await smoke("smoke-auth.mjs");
    await smoke("smoke-agent-listings.mjs");
    progress("final-read-only-checks");
    const finalApi = await currentApi();
    requireDeploy(
      finalApi.Image === candidate &&
        changedEnvironmentKeys(
          wanted.environment,
          envObject(finalApi.Config.Env),
        ).length === 0,
      "DEPLOYED_API_CONFIG_MISMATCH",
    );
    requireDeploy(
      JSON.stringify(await footprint()) === JSON.stringify(beforeFootprint),
      "NON_API_SERVICE_CHANGED",
    );
    const finalOps = await checkOperations({ environment });
    requireDeploy(finalOps.status === "ok", "POST_DEPLOY_OPERATIONS_FAILED");
    events.push({
      step: "operations",
      status: finalOps.status,
      checks: finalOps.results.length,
    });
    report = {
      status: "deployed",
      run,
      previousImage: previous.Image,
      image: candidate,
      rollbackImage,
      rollbackTag: beforeTag,
      unaffectedServicesUnchanged: true,
      environmentUnchanged: true,
      events,
    };
  }
} catch (error) {
  const failure = { stage, code: error.message };
  if (switched && previous) {
    progress("rollback-api-only");
    try {
      await docker([
        ...compose,
        "--file",
        rollbackFile,
        "up",
        "-d",
        "--no-deps",
        "--no-build",
        "api",
      ]);
      await waitHealthy(rollbackImage);
      await docker(["image", "tag", rollbackImage, "real-estate-platform-api"]);
      rollback = "restored";
    } catch {
      rollback = "failed-needs-attention";
    }
  }
  report = { status: "failed", run, failure, rollback, events };
  process.exitCode = 1;
} finally {
  report.checkedAt = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(report, null, 2),
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
}
