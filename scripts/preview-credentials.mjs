import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  assertOwned,
  assertIsolated,
  validRun,
  quickOrigin,
  parsePreviewPasswordInput,
} from "./preview-safety.mjs";

// Current synthetic preview only. Password is read from stdin, never arguments or logs.
const root = fileURLToPath(new URL("../", import.meta.url));
const dockerExe = "C:/Program Files/Docker/Docker/resources/bin/docker.exe";
async function docker(args, input) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(dockerExe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("DOCKER_TIMEOUT"));
    }, 60000);
    child.stdout.on("data", (data) => {
      out += data;
    });
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("DOCKER_START_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolveResult(out.trim())
        : reject(new Error("DOCKER_FAILED"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
const username = process.argv[2];
assert.match(username ?? "", /^[A-Za-z0-9_-]{1,64}$/);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const password = parsePreviewPasswordInput(input);
const state = JSON.parse(
  await readFile(resolve(root, ".artifacts/preview-status.json"), "utf8"),
);
assert.equal(state.stage, "ready");
assert.ok(Date.parse(state.expiresAt) > Date.now());
const run = validRun(state.run),
  prefix = `property-preview-${run}`;
const directory = resolve(root, ".artifacts", `preview-${run}`);
let accessMode = "protected";
try {
  accessMode = JSON.parse(
    await readFile(resolve(directory, "access-mode.json"), "utf8"),
  ).mode;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
assert.equal(
  accessMode,
  "protected",
  "Public browsing has no entrance password; switch to protected mode first",
);
const accessPath = resolve(directory, "access.txt"),
  authPath = resolve(directory, "preview-auth.caddy");
const previousAccess = await readFile(accessPath, "utf8");
const oldUsername = previousAccess.match(/^사용자 이름: (.+)$/m)?.[1];
const oldPassword = previousAccess.match(/^암호: (.+)$/m)?.[1];
assert.ok(oldUsername && oldPassword);
const info = JSON.parse(await docker(["inspect", `${prefix}-gateway`]))[0];
assertOwned("container", info, info.Id, run);
assert.ok(state.containers.includes(info.Id));
assertIsolated(info, `${prefix}-network`, true);
const origin = quickOrigin(state.origin);
async function hash(passwordValue) {
  const value = await docker(
    [
      "exec",
      "--interactive",
      info.Id,
      "caddy",
      "hash-password",
      "--algorithm",
      "bcrypt",
      "--bcrypt-cost",
      "12",
    ],
    passwordValue + "\n",
  );
  assert.match(value, /^\$2[aby]\$12\$/);
  return value;
}
async function request(path, user, pass) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: user
      ? {
          Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
        }
      : {},
  });
  await response.arrayBuffer();
  return response.status;
}
async function install(text) {
  await writeFile(authPath, text);
  assertOwned(
    "container",
    JSON.parse(await docker(["inspect", info.Id]))[0],
    info.Id,
    run,
  );
  await docker(["cp", authPath, `${info.Id}:/data/preview-auth.caddy`]);
  await docker([
    "exec",
    info.Id,
    "caddy",
    "validate",
    "--config",
    "/etc/caddy/Caddyfile",
    "--adapter",
    "caddyfile",
  ]);
  // Same container ID: the existing supervisor retains safe shutdown ownership.
  await docker(["restart", "--timeout", "5", info.Id]);
}
const oldHash = await hash(oldPassword),
  nextHash = await hash(password);
let installed = false;
try {
  installed = true;
  await install(`${username} ${nextHash}\n`);
  let ready = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      if ((await request("/listings", username, password)) === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
  assert.ok(ready);
  assert.equal(await request("/listings"), 401);
  assert.equal(await request("/api/v1/listings"), 401);
  assert.equal(await request("/api/v1/listings", username, password), 200);
  assert.equal(await request("/listings", username, `${password}wrong`), 401);
  if (username !== oldUsername || password !== oldPassword)
    assert.equal(await request("/listings", oldUsername, oldPassword), 401);
  await writeFile(
    accessPath,
    previousAccess
      .replace(/^사용자 이름: .+$/m, `사용자 이름: ${username}`)
      .replace(/^암호: .+$/m, `암호: ${password}`),
  );
  await writeFile(
    resolve(directory, "credential-change.json"),
    JSON.stringify(
      {
        changedAt: new Date().toISOString(),
        gateOnly: true,
        gatewayIdUnchanged: true,
        passed: true,
        checks: [
          "new credentials 200",
          "old credentials 401",
          "missing and wrong credentials 401",
          "API protected",
        ],
        weakPasswordExplicitlyRequested: password.length < 12,
      },
      null,
      2,
    ),
  );
  console.log(
    "Preview gate credentials updated and verified; app accounts, URL, data and expiry unchanged.",
  );
} catch {
  if (installed) {
    try {
      await install(`${oldUsername} ${oldHash}\n`);
      await writeFile(accessPath, previousAccess);
    } catch {
      console.error("GATE_ROLLBACK_NEEDS_INSPECTION");
    }
  }
  console.error("GATE_CREDENTIAL_CHANGE_FAILED");
  process.exitCode = 1;
}
