import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { quickOrigin, validRun } from "./preview-safety.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const state = JSON.parse(
  await readFile(resolve(root, ".artifacts/preview-status.json"), "utf8"),
);
assert.equal(state.stage, "ready");
const directory = resolve(root, ".artifacts", `preview-${validRun(state.run)}`);
const access = await readFile(resolve(directory, "access.txt"), "utf8");
const password = access.match(/^암호: (.+)$/m)?.[1];
const username = access.match(/^사용자 이름: (.+)$/m)?.[1];
const appPassword = access.match(/^사이트 로그인 암호: (.+)$/m)?.[1];
assert.ok(username && password && appPassword);
const origin = quickOrigin(state.origin);
let cookie, csrf, uploaded, draft;
const checks = [];
async function request(path, options = {}, expected = 200, gate = true) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(20000),
    redirect: "error",
    headers: {
      ...(gate
        ? {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
          }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  assert.equal(
    response.status,
    expected,
    `${options.method ?? "GET"} ${path}: unexpected status`,
  );
  return response;
}
try {
  const response = await request("/listings");
  const html = await response.text();
  assert.match(html, /가상 테스트/);
  const jsPaths = [
    ...html.matchAll(/src="(\/_next\/[^"?]+\.js)(?:[^\"]*)"/g),
  ].map((match) => match[1]);
  assert.ok(jsPaths.length > 0);
  for (const path of new Set(jsPaths)) {
    const js = await (await request(path)).text();
    assert.ok(!js.includes("http://localhost:4000"));
  }
  await request(jsPaths[0], {}, 401, false);
  checks.push(
    "SSR listings and all referenced JavaScript load without localhost API URLs",
  );
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "agent@example.test",
      password: appPassword,
    }),
  });
  cookie = login.headers.get("set-cookie").split(";")[0];
  csrf = (await login.json()).csrfToken;
  const mine = await (await request("/api/v1/listings/mine")).json();
  draft = mine.items.find(
    (item) =>
      item.title === "[가상 테스트] 사진 업로드용 초안" &&
      item.status === "DRAFT",
  );
  assert.ok(draft);
  const detail = await (
    await request(`/api/v1/listings/mine/${draft.id}`)
  ).json();
  const form = new FormData();
  form.set("version", String(detail.version));
  form.set(
    "image",
    new Blob(
      [
        await readFile(
          resolve(
            root,
            "apps/web/public/sample-listings/seoul-forest-bedroom.webp",
          ),
        ),
      ],
      { type: "image/webp" },
    ),
    "synthetic-preview-check.webp",
  );
  uploaded = await (
    await request(
      `/api/v1/listings/mine/${draft.id}/images`,
      {
        method: "POST",
        headers: { Origin: origin, "x-csrf-token": csrf },
        body: form,
      },
      201,
    )
  ).json();
  assert.equal(uploaded.image.status, "UPLOADED");
  let ready;
  for (let i = 0; i < 45; i++) {
    const current = await (
      await request(`/api/v1/listings/mine/${draft.id}`)
    ).json();
    ready = current.images.find((item) => item.id === uploaded.image.id);
    assert.notEqual(ready?.status, "REJECTED");
    if (ready?.status === "READY") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(ready?.status, "READY");
  assert.equal(ready.mimeType, "image/webp");
  for (const path of [ready.contentPath, ready.thumbnailPath]) {
    const photo = await request(`/api/v1${path}`);
    assert.match(photo.headers.get("content-type"), /image\/webp/);
    await photo.arrayBuffer();
    await request(`/api/v1${path}`, {}, 401, false);
  }
  checks.push(
    "HTTPS multipart upload, real ClamAV scanning, WebP and thumbnail, password gate on actual photo URLs",
  );
} catch {
  checks.push(
    "FAILED: preview verification; credentials and response bodies intentionally omitted",
  );
  process.exitCode = 1;
} finally {
  try {
    if (uploaded?.image?.id && draft) {
      const current = await (
        await request(`/api/v1/listings/mine/${draft.id}`)
      ).json();
      await request(
        `/api/v1/listings/mine/${draft.id}/images/${uploaded.image.id}`,
        {
          method: "DELETE",
          headers: {
            Origin: origin,
            "x-csrf-token": csrf,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ version: current.version }),
        },
      );
      checks.push(
        "Only this verification's synthetic upload removed; seeded listings and user data preserved",
      );
    }
    if (cookie && csrf)
      await request("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          Origin: origin,
          "x-csrf-token": csrf,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
  } catch {
    process.exitCode = 1;
    checks.push("Verification cleanup needs inspection");
  }
  const report = {
    checkedAt: new Date().toISOString(),
    origin,
    passed: !process.exitCode,
    checks,
  };
  await writeFile(
    resolve(directory, "verification.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
