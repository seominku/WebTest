import assert from "node:assert/strict";
import test from "node:test";
import { checkOperations } from "./operations-check.mjs";

const timestamp = Date.parse("2026-09-05T10:00:00Z");
const isoNow = new Date(timestamp).toISOString();
function healthyResponses() {
  return {
    "/api/health": { service: "web", status: "ok" },
    "/api/v1/health/live": { service: "api", status: "ok" },
    "/api/v1/health/ready": {
      status: "ok",
      checks: ["postgres", "redis", "object-storage", "malware-scanner"].map(
        (name) => ({ name, status: "up" }),
      ),
    },
    "/-/ready": "ready",
    "/api/v1/targets": {
      status: "success",
      data: {
        activeTargets: [
          {
            labels: { job: "real-estate-api" },
            health: "up",
            lastScrape: isoNow,
          },
        ],
      },
    },
    "/api/v1/rules": {
      status: "success",
      data: {
        groups: [
          {
            rules: ["Failed", "Stale", "Stuck"].map((suffix) => ({
              name: `ListingImageOrphanCleanup${suffix}`,
              health: "ok",
              state: "inactive",
              lastEvaluation: isoNow,
            })),
          },
        ],
      },
    },
    "/api/v1/alertmanagers": {
      status: "success",
      data: {
        activeAlertmanagers: [
          { url: "http://alertmanager:9093/api/v2/alerts" },
        ],
      },
    },
  };
}

async function run(responses = healthyResponses(), override) {
  return checkOperations({
    now: () => timestamp,
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).hostname, "127.0.0.1");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.headers.Authorization, undefined);
      const path = new URL(url).pathname;
      if (override) {
        const result = await override(path);
        if (result) return result;
      }
      if (path.startsWith("/api/v1/health/metrics"))
        return new Response("Unauthorized", { status: 401 });
      assert.ok(Object.hasOwn(responses, path), path);
      return new Response(JSON.stringify(responses[path]));
    },
  });
}

test("healthy stack: all ten read-only checks pass without credentials", async () => {
  const report = await run();
  assert.equal(report.status, "ok");
  assert.equal(report.results.length, 10);
});

test("HTTP 200 with a missing dependency is not a healthy stack", async () => {
  const responses = healthyResponses();
  responses["/api/v1/health/ready"].checks.pop();
  const report = await run(responses);
  assert.equal(report.status, "needs_attention");
  assert.match(
    report.results.find((r) => r.id === "dependencies").detail,
    /malware-scanner/,
  );
});

for (const kind of ["missing", "down", "stale"]) {
  test(`detect ${kind} API metric collection`, async () => {
    const responses = healthyResponses();
    const targets = responses["/api/v1/targets"].data.activeTargets;
    if (kind === "missing") targets.pop();
    if (kind === "down") targets[0].health = "down";
    if (kind === "stale")
      targets[0].lastScrape = new Date(timestamp - 180000).toISOString();
    const report = await run(responses);
    assert.equal(
      report.results.find((r) => r.id === "metrics-scrape").status,
      "fail",
    );
  });
}

for (const kind of ["missing", "firing", "pending", "error", "stale"]) {
  test(`detect ${kind} alert rule`, async () => {
    const responses = healthyResponses();
    const rules = responses["/api/v1/rules"].data.groups[0].rules;
    if (kind === "missing") rules.pop();
    if (["firing", "pending"].includes(kind)) rules[0].state = kind;
    if (kind === "error") rules[0].health = "err";
    if (kind === "stale")
      rules[0].lastEvaluation = new Date(timestamp - 180000).toISOString();
    const report = await run(responses);
    assert.equal(
      report.results.find((r) => r.id === "alert-rules").status,
      "fail",
    );
  });
}

test("missing local alert route fails", async () => {
  const responses = healthyResponses();
  responses["/api/v1/alertmanagers"].data.activeAlertmanagers = [];
  const report = await run(responses);
  assert.equal(
    report.results.find((r) => r.id === "alert-route").status,
    "fail",
  );
});

test("unprotected metrics fail without aborting the other checks", async () => {
  const report = await run(undefined, (path) =>
    path.includes("metrics") ? new Response("secret", { status: 200 }) : null,
  );
  assert.equal(report.results.filter((r) => r.status === "fail").length, 2);
  assert.ok(!JSON.stringify(report).includes("secret"));
});

test("malformed JSON, HTTP errors and timeouts are reported safely", async () => {
  const report = await run(undefined, (path) => {
    if (path === "/api/health") return new Response("not json secret");
    if (path === "/api/v1/health/live")
      return new Response("secret", { status: 503 });
    if (path === "/-/ready") throw new DOMException("secret", "TimeoutError");
  });
  assert.equal(report.results.filter((r) => r.status === "fail").length, 4);
  assert.ok(!JSON.stringify(report).includes("secret"));
  assert.match(
    report.results.find((r) => r.id === "prometheus").detail,
    /제한 시간/,
  );
});

test("invalid ports cannot redirect requests to external destinations", async () => {
  for (const port of [
    "0",
    "65536",
    "1.5",
    "http://example.com",
    "3000@example.com",
  ]) {
    await assert.rejects(
      checkOperations({
        environment: { WEB_PORT: port },
        fetchImpl: () => assert.fail("no request should be made"),
      }),
      /WEB_PORT/,
    );
  }
});

test("custom Compose ports remain on loopback", async () => {
  const ports = new Set();
  await checkOperations({
    environment: {
      WEB_PORT: "3100",
      API_PORT: "4100",
      PROMETHEUS_PORT: "9190",
      ALERTMANAGER_PORT: "9193",
    },
    fetchImpl: async (url) => {
      assert.equal(new URL(url).hostname, "127.0.0.1");
      ports.add(new URL(url).port);
      throw new Error("offline");
    },
  });
  assert.deepEqual([...ports].sort(), ["3100", "4100", "9190", "9193"]);
});
