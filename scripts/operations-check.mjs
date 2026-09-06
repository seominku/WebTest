import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

const dependencies = ["postgres", "redis", "object-storage", "malware-scanner"];
const expectedRules = [
  "ListingImageOrphanCleanupFailed",
  "ListingImageOrphanCleanupStale",
  "ListingImageOrphanCleanupStuck",
];

class CheckFailure extends Error {}

function requireCheck(condition, message) {
  if (!condition) throw new CheckFailure(message);
}

function localOrigin(environment, key, fallback) {
  const port = String(environment[key] ?? fallback);
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new CheckFailure(`${key}: 포트는 1~65535 사이 정수여야 합니다.`);
  }
  // Only loopback destinations are allowed; never accept an arbitrary base URL.
  return `http://127.0.0.1:${Number(port)}`;
}

export async function checkOperations({
  environment = {},
  fetchImpl = fetch,
  timeoutMs = 8000,
  now = () => Date.now(),
} = {}) {
  const started = now();
  const web = localOrigin(environment, "WEB_PORT", 3000);
  const api = `${localOrigin(environment, "API_PORT", 4000)}/api/v1`;
  const prometheus = localOrigin(environment, "PROMETHEUS_PORT", 9090);
  const alertmanager = localOrigin(environment, "ALERTMANAGER_PORT", 9093);

  async function request(url, expectedStatus = 200, json = true) {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: json ? "application/json" : "text/plain" },
    });
    requireCheck(
      response.status === expectedStatus,
      `HTTP ${expectedStatus} 예상, ${response.status} 응답`,
    );
    if (json) return response.json();
    await response.text();
  }

  const checks = [
    [
      "web",
      "웹 서버",
      async () => {
        const body = await request(`${web}/api/health`);
        requireCheck(
          body.service === "web" && body.status === "ok",
          "웹 상태 응답이 정상이 아닙니다.",
        );
      },
    ],
    [
      "api",
      "API 서버",
      async () => {
        const body = await request(`${api}/health/live`);
        requireCheck(
          body.service === "api" && body.status === "ok",
          "API 상태 응답이 정상이 아닙니다.",
        );
      },
    ],
    [
      "dependencies",
      "DB·세션·사진 저장소·악성코드 검사",
      async () => {
        const body = await request(`${api}/health/ready`);
        requireCheck(
          body.status === "ok" && Array.isArray(body.checks),
          "준비 상태 응답이 정상이 아닙니다.",
        );
        const failed = dependencies.filter(
          (name) =>
            !body.checks.some(
              (check) => check.name === name && check.status === "up",
            ),
        );
        requireCheck(
          failed.length === 0,
          `정상 연결 미확인: ${failed.join(", ")}`,
        );
      },
    ],
    [
      "metrics-auth",
      "수집 지표 비인증 접근 차단",
      () => request(`${api}/health/metrics/prometheus`, 401, false),
    ],
    [
      "admin-metrics-auth",
      "관리자 지표 비인증 접근 차단",
      () => request(`${api}/health/metrics`, 401, false),
    ],
    [
      "prometheus",
      "모니터링 서버",
      () => request(`${prometheus}/-/ready`, 200, false),
    ],
    [
      "metrics-scrape",
      "API 지표 실제 수집",
      async () => {
        const body = await request(`${prometheus}/api/v1/targets`);
        requireCheck(
          body.status === "success" && Array.isArray(body.data?.activeTargets),
          "수집 대상 응답이 올바르지 않습니다.",
        );
        const targets = body.data.activeTargets.filter(
          (target) => target.labels?.job === "real-estate-api",
        );
        requireCheck(targets.length > 0, "API 수집 대상이 없습니다.");
        requireCheck(
          targets.every((target) => {
            const age = now() - Date.parse(target.lastScrape);
            return target.health === "up" && age >= -5000 && age <= 120000;
          }),
          "API 지표 수집 실패 또는 최근 2분 내 수집 기록이 없습니다.",
        );
      },
    ],
    [
      "alert-rules",
      "사진 정리 경보 규칙",
      async () => {
        const body = await request(`${prometheus}/api/v1/rules?type=alert`);
        requireCheck(
          body.status === "success" && Array.isArray(body.data?.groups),
          "경보 규칙 응답이 올바르지 않습니다.",
        );
        const rules = body.data.groups.flatMap((group) => group.rules ?? []);
        const failed = expectedRules.filter((name) => {
          const matches = rules.filter((rule) => rule.name === name);
          return (
            matches.length === 0 ||
            matches.some((rule) => {
              const age = now() - Date.parse(rule.lastEvaluation);
              return (
                rule.health !== "ok" ||
                rule.state !== "inactive" ||
                !Number.isFinite(age) ||
                age < -5000 ||
                age > 120000
              );
            })
          );
        });
        requireCheck(
          failed.length === 0,
          `경보 발생·평가 실패·규칙 누락·평가 지연: ${failed.join(", ")}`,
        );
      },
    ],
    [
      "alert-route",
      "로컬 경보 수신 서버 연결 설정",
      async () => {
        const body = await request(`${prometheus}/api/v1/alertmanagers`);
        requireCheck(
          body.status === "success" &&
            Array.isArray(body.data?.activeAlertmanagers),
          "경보 수신 대상 응답이 올바르지 않습니다.",
        );
        requireCheck(
          body.data.activeAlertmanagers.some((target) => {
            try {
              const url = new URL(target.url);
              return (
                url.protocol === "http:" &&
                url.hostname === "alertmanager" &&
                url.port === "9093"
              );
            } catch {
              return false;
            }
          }),
          "로컬 Alertmanager 수신 대상이 없습니다.",
        );
      },
    ],
    [
      "alertmanager",
      "로컬 경보 수신 서버",
      () => request(`${alertmanager}/-/ready`, 200, false),
    ],
  ];

  const results = await Promise.all(
    checks.map(async ([id, name, run]) => {
      try {
        await run();
        return { id, name, status: "pass" };
      } catch (error) {
        // Do not print raw response bodies, URLs, tokens or exception messages.
        const detail =
          error instanceof CheckFailure
            ? error.message
            : ["TimeoutError", "AbortError"].includes(error?.name)
              ? "제한 시간 내 응답이 없습니다."
              : "연결 실패 또는 응답 형식 오류입니다.";
        return { id, name, status: "fail", detail };
      }
    }),
  );
  return {
    status: results.every((result) => result.status === "pass")
      ? "ok"
      : "needs_attention",
    checkedAt: new Date(now()).toISOString(),
    durationMs: now() - started,
    scope: "local_read_only",
    results,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const envPath = resolve(".env");
    const fileEnvironment = existsSync(envPath)
      ? parseEnv(readFileSync(envPath, "utf8"))
      : {};
    const report = await checkOperations({
      environment: { ...fileEnvironment, ...process.env },
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "ok") process.exitCode = 1;
  } catch (error) {
    console.error(
      error instanceof CheckFailure
        ? error.message
        : "점검 설정을 읽지 못했습니다.",
    );
    process.exitCode = 1;
  }
}
