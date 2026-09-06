import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@real-estate/db";

function loadEnvironment(path) {
  const contents = readFileSync(path, "utf8");

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  }
}

loadEnvironment(new URL("../.env", import.meta.url));

const apiBase =
  process.env.SMOKE_API_BASE_URL ?? "http://localhost:4000/api/v1";
const origin = process.env.SMOKE_WEB_ORIGIN ?? "http://localhost:3000";
const email = `smoke-auth-${randomUUID()}@example.test`;
const password = "SmokeTestPassword123!";
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}` +
    `@localhost:5432/${process.env.POSTGRES_DB}?schema=public`;
const prisma = createPrismaClient(databaseUrl);

let cookie;
let userId;

async function request(path, options = {}, expectedStatus = 200) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];

  const body = await response.json().catch(() => undefined);
  if (response.status !== expectedStatus) {
    throw new Error(
      `${options.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status}`,
    );
  }
  return body;
}

try {
  const registration = await request(
    "/auth/register",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({
        email,
        password,
        displayName: "인증 스모크 테스트",
      }),
    },
    201,
  );
  userId = registration.user.id;
  if (!registration.verificationToken) {
    throw new Error("Local registration did not return a verification token");
  }

  await request(
    "/auth/verify-email",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ token: registration.verificationToken }),
    },
    200,
  );

  const login = await request(
    "/auth/login",
    {
      method: "POST",
      headers: { Origin: origin },
      body: JSON.stringify({ email, password }),
    },
    200,
  );
  const me = await request("/auth/me");
  const csrf = await request("/auth/csrf");

  await request("/auth/logout", {
    method: "POST",
    headers: { Origin: origin, "X-CSRF-Token": csrf.csrfToken },
    body: JSON.stringify({}),
  });
  await request("/auth/me", {}, 401);

  console.log(
    JSON.stringify({
      status: "ok",
      checks: [
        "register",
        "verify-email",
        "login",
        "authenticated-me",
        "csrf-rotation",
        "logout",
        "revoked-session-rejected",
      ],
      userMatched: login.user.id === userId && me.user.id === userId,
    }),
  );
} finally {
  const user = userId
    ? { id: userId }
    : await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    await prisma.auditLog.deleteMany({ where: { actorId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
  await prisma.$disconnect();
}
