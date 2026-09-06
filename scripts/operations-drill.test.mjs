import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkOperations } from "./operations-check.mjs";
import { createOperationsStack } from "./fixtures/operations-stack.mjs";

const cliPath = fileURLToPath(
  new URL("./operations-check.mjs", import.meta.url),
);
const workspace = fileURLToPath(new URL("../", import.meta.url));

function runCli(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath], {
      cwd: workspace,
      env: { ...process.env, ...environment },
      windowsHide: true,
      timeout: 15000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        assert.equal(stderr, "");
        resolve({ code, report: JSON.parse(stdout) });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function assertFailures(report, expected) {
  assert.equal(report.status, expected.length ? "needs_attention" : "ok");
  assert.equal(report.results.length, 10);
  assert.deepEqual(
    report.results
      .filter((result) => result.status === "fail")
      .map((result) => result.id)
      .sort(),
    [...expected].sort(),
  );
}

test(
  "isolated HTTP fault detection and recovery drill",
  { timeout: 60000 },
  async (t) => {
    const stack = await createOperationsStack();
    t.after(() => stack.close());
    const check = (options = {}) =>
      checkOperations({
        environment: stack.environment,
        timeoutMs: 2000,
        ...options,
      });

    await t.test("baseline: all synthetic services are healthy", async () => {
      assertFailures(await check(), []);
    });

    for (const service of ["web", "alertmanager"]) {
      await t.test(
        `${service}: real listener shutdown is detected, then restart recovers`,
        async () => {
          await stack.stop(service);
          try {
            assertFailures(await check(), [service]);
          } finally {
            await stack.start(service);
          }
          assertFailures(await check(), []);
        },
      );
    }

    const scenarios = [
      ["dependency-down", ["dependencies"]],
      [
        "connection-reset",
        ["api", "dependencies", "metrics-auth", "admin-metrics-auth"],
      ],
      ["unprotected-metrics", ["metrics-auth", "admin-metrics-auth"]],
      ["stale-monitoring", ["metrics-scrape", "alert-rules"]],
      ["firing-alert", ["alert-rules"]],
      ["malformed", ["web"]],
      ["redirect", ["web"]],
      ["timeout", ["web"]],
    ];
    for (const [fault, expected] of scenarios) {
      await t.test(
        `${fault}: detects failure and returns to healthy after recovery`,
        async () => {
          stack.state.fault = fault;
          try {
            const report = await check();
            assertFailures(report, expected);
            if (fault === "timeout") {
              assert.match(
                report.results.find((result) => result.id === "web").detail,
                /제한 시간/,
              );
            }
            if (fault === "redirect") assert.equal(stack.state.redirectHits, 0);
          } finally {
            stack.state.fault = null;
          }
          assertFailures(await check(), []);
        },
      );
    }

    await t.test(
      "actual CLI: exit codes follow healthy → fault → recovery",
      async () => {
        const healthy = await runCli(stack.environment);
        assert.equal(healthy.code, 0);
        assertFailures(healthy.report, []);
        stack.state.fault = "dependency-down";
        try {
          const failed = await runCli(stack.environment);
          assert.equal(failed.code, 1);
          assertFailures(failed.report, ["dependencies"]);
        } finally {
          stack.state.fault = null;
        }
        const recovered = await runCli(stack.environment);
        assert.equal(recovered.code, 0);
        assertFailures(recovered.report, []);
      },
    );
  },
);
