import { readFileSync } from "node:fs";
import { createPrismaClient } from "@real-estate/db";

function loadEnvironment(path) {
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    process.env[key] ??= value;
  }
}

loadEnvironment(new URL("../.env", import.meta.url));

const apiBase = (
  process.env.SMOKE_API_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/u, "");
const origin = process.env.SMOKE_WEB_ORIGIN ?? "http://localhost:3000";
const databaseUrl =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB}?schema=public`;
const prisma = createPrismaClient(databaseUrl);
const startedAt = new Date();
const customerId = "10000000-0000-4000-8000-000000000003";
const agentUserId = "10000000-0000-4000-8000-000000000001";
const listingId = "60000000-0000-4000-8000-000000000001";
const password = "LocalAgentPassword123!";
let savedSearchId;
let viewingId;

function client() {
  let cookie = "";
  let csrfToken = "";
  return {
    async request(path, options = {}, expectedStatus = 200) {
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
      if (response.status !== expectedStatus)
        throw new Error(
          `${options.method ?? "GET"} ${path}: expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`,
        );
      if (body?.csrfToken) csrfToken = body.csrfToken;
      return body;
    },
    mutate(path, method, body = {}, expectedStatus = 200) {
      return this.request(
        path,
        {
          body: JSON.stringify(body),
          headers: { Origin: origin, "X-CSRF-Token": csrfToken },
          method,
        },
        expectedStatus,
      );
    },
  };
}

const customer = client();
const agent = client();

try {
  await customer.request("/auth/login", {
    body: JSON.stringify({ email: "seed-user@local.invalid", password }),
    headers: { Origin: origin },
    method: "POST",
  });
  await agent.request("/auth/login", {
    body: JSON.stringify({ email: "seed-agent@local.invalid", password }),
    headers: { Origin: origin },
    method: "POST",
  });

  const saved = await customer.mutate(
    "/saved-searches",
    "POST",
    {
      name: "E2E 성동구 매매",
      sido: "서울특별시",
      sigungu: "성동구",
      transactionType: "SALE",
    },
    201,
  );
  savedSearchId = saved.id;
  const savedList = await customer.request("/saved-searches");
  if (!savedList.items.some((item) => item.id === savedSearchId))
    throw new Error("Saved search was not listed");

  const requestedAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const viewing = await customer.mutate(
    "/viewings",
    "POST",
    {
      listingId,
      message: "E2E 방문 일정 확인입니다.",
      requestedAt,
    },
    201,
  );
  viewingId = viewing.id;
  const received = await agent.request("/viewings/received");
  if (!received.items.some((item) => item.id === viewingId))
    throw new Error("Agent did not receive viewing request");
  const proposedAt = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString();
  await agent.mutate(
    `/viewings/${viewingId}/reschedule-proposals`,
    "POST",
    {
      message: "오후 방문으로 변경을 제안합니다.",
      proposedAt,
    },
    201,
  );
  await customer.mutate(
    `/viewings/${viewingId}/reschedule-proposals/respond`,
    "PUT",
    { accepted: true },
  );
  const mine = await customer.request("/viewings/mine");
  if (
    !mine.items.some(
      (item) =>
        item.id === viewingId &&
        item.requestedAt === proposedAt &&
        item.rescheduleProposal?.status === "ACCEPTED" &&
        item.status === "CONFIRMED",
    )
  )
    throw new Error("Accepted viewing reschedule was not visible to customer");
  await customer.mutate(`/viewings/${viewingId}/cancel`, "POST", {}, 201);
  await customer.mutate(`/saved-searches/${savedSearchId}`, "DELETE");
  await customer.mutate("/auth/logout", "POST");
  await agent.mutate("/auth/logout", "POST");

  console.log(
    JSON.stringify({
      status: "ok",
      checks: [
        "saved-search-create-list-delete",
        "viewing-request-reschedule-accept-cancel",
        "two-role-session-flow",
      ],
    }),
  );
} finally {
  if (viewingId) {
    await prisma.viewingRescheduleProposal.deleteMany({
      where: { viewingAppointmentId: viewingId },
    });
    await prisma.viewingAppointment.deleteMany({ where: { id: viewingId } });
  }
  if (savedSearchId)
    await prisma.savedSearch.deleteMany({ where: { id: savedSearchId } });
  await prisma.savedSearch.deleteMany({
    where: {
      createdAt: { gte: startedAt },
      name: "E2E 성동구 매매",
      userId: customerId,
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      actorId: { in: [customerId, agentUserId] },
      createdAt: { gte: startedAt },
    },
  });
  await prisma.session.deleteMany({
    where: {
      createdAt: { gte: startedAt },
      userId: { in: [customerId, agentUserId] },
    },
  });
  await prisma.$disconnect();
}
