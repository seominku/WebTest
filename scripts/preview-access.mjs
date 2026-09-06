import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertOwned,
  assertIsolated,
  validRun,
  quickOrigin,
} from "./preview-safety.mjs";
import { checkPublicBrowsing } from "./preview-public-check.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2]?.replace(/^--/, "");
assert.ok(
  ["public", "protected"].includes(mode),
  "Use --public or --protected",
);
assert.equal(process.argv.length, 3);
const state = JSON.parse(
  await readFile(resolve(root, ".artifacts/preview-status.json"), "utf8"),
);
assert.equal(state.stage, "ready");
assert.ok(Date.parse(state.expiresAt) > Date.now());
const prefix = `property-preview-${validRun(state.run)}`;
const directory = resolve(root, ".artifacts", `preview-${state.run}`);
const modePath = resolve(directory, "access-mode.json");
const accessPath = resolve(directory, "access.txt");
const access = await readFile(accessPath, "utf8");
let previousMode = "protected";
try {
  previousMode = JSON.parse(await readFile(modePath, "utf8")).mode;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
assert.ok(["public", "protected"].includes(previousMode));
const dockerExe = "C:/Program Files/Docker/Docker/resources/bin/docker.exe";
async function docker(args) {
  try {
    return (
      await promisify(execFile)(dockerExe, args, {
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
      })
    ).stdout.trim();
  } catch {
    throw new Error("PREVIEW_DOCKER_OPERATION_FAILED");
  }
}
const gateway = JSON.parse(await docker(["inspect", `${prefix}-gateway`]))[0];
assertOwned("container", gateway, gateway.Id, state.run);
assertIsolated(gateway, `${prefix}-network`, true);
assert.ok(state.containers.includes(gateway.Id));
async function install(value) {
  assertOwned(
    "container",
    JSON.parse(await docker(["inspect", gateway.Id]))[0],
    gateway.Id,
    state.run,
  );
  await docker([
    "cp",
    resolve(root, `infrastructure/preview/access-${value}.caddy`),
    `${gateway.Id}:/data/preview-access.caddy`,
  ]);
  await docker([
    "exec",
    gateway.Id,
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
  await docker(["restart", "--timeout", "5", gateway.Id]);
}
const origin = quickOrigin(state.origin);
try {
  await install(mode);
  let checks;
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (mode === "public") checks = await checkPublicBrowsing(origin);
      else {
        checks = [];
        for (const path of ["/listings", "/api/v1/listings"]) {
          const response = await fetch(`${origin}${path}`, {
            signal: AbortSignal.timeout(15000),
          });
          assert.equal(response.status, 401);
          assert.match(response.headers.get("www-authenticate"), /^Basic /);
          await response.arrayBuffer();
          checks.push({ path, status: 401 });
        }
      }
      break;
    } catch {
      if (attempt === 9) throw new Error("PREVIEW_ACCESS_CHECK_FAILED");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const report = {
    mode,
    changedAt: new Date().toISOString(),
    origin,
    passed: true,
    appAuthenticationRequired: true,
    expiresAt: state.expiresAt,
    checks,
  };
  await writeFile(modePath, JSON.stringify(report, null, 2));
  const notice =
    mode === "public"
      ? "매물 조회는 로그인 없이 공개됩니다. 아래 입구 암호는 현재 사용하지 않습니다. 등록/수정용 사이트 로그인은 별도입니다."
      : "입구 접속 암호가 필요합니다. 사이트 로그인은 별도입니다.";
  await writeFile(
    accessPath,
    `접속 방식: ${notice}\n${access.replace(/^접속 방식: .*\r?\n/, "")}`,
  );
  console.log(JSON.stringify(report, null, 2));
} catch {
  try {
    await install(previousMode);
  } catch {
    console.error("PREVIEW_ACCESS_ROLLBACK_NEEDS_INSPECTION");
  }
  console.error("PREVIEW_ACCESS_CHANGE_FAILED");
  process.exitCode = 1;
}
