import { createServer } from "node:http";

// Synthetic HTTP services only. No Docker, database, credentials or .env access.
export async function createOperationsStack() {
  const state = { fault: null, redirectHits: 0 };
  const services = {};
  const json = (response, body, status = 200) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };

  function handler(name, request, response) {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    if (name === "web" && path === "/redirect-target") {
      state.redirectHits += 1;
      json(response, { service: "web", status: "ok" });
      return;
    }
    if (name === "web" && path === "/api/health") {
      if (state.fault === "timeout") {
        // Send headers but leave the body unfinished to test the real deadline.
        response.writeHead(200, { "Content-Type": "application/json" });
        response.flushHeaders();
        response.write('{"service":');
        return;
      }
      if (state.fault === "redirect") {
        response.writeHead(302, { Location: "/redirect-target" }).end();
        return;
      }
      if (state.fault === "malformed") {
        response.writeHead(200).end("synthetic-invalid-json");
        return;
      }
      json(response, { service: "web", status: "ok" });
      return;
    }
    if (name === "api") {
      if (state.fault === "connection-reset") {
        request.socket.destroy();
        return;
      }
      if (path === "/api/v1/health/live") {
        json(response, { service: "api", status: "ok" });
        return;
      }
      if (path === "/api/v1/health/ready") {
        const failed = state.fault === "dependency-down";
        json(
          response,
          {
            status: failed ? "unavailable" : "ok",
            checks: [
              "postgres",
              "redis",
              "object-storage",
              "malware-scanner",
            ].map((dependency) => ({
              name: dependency,
              status: failed && dependency === "postgres" ? "down" : "up",
            })),
          },
          failed ? 503 : 200,
        );
        return;
      }
      if (
        [
          "/api/v1/health/metrics",
          "/api/v1/health/metrics/prometheus",
        ].includes(path)
      ) {
        response
          .writeHead(state.fault === "unprotected-metrics" ? 200 : 401)
          .end();
        return;
      }
    }
    if (["prometheus", "alertmanager"].includes(name) && path === "/-/ready") {
      response.writeHead(200).end("ready");
      return;
    }
    if (name === "prometheus") {
      const timestamp = new Date(
        Date.now() - (state.fault === "stale-monitoring" ? 180000 : 0),
      ).toISOString();
      if (path === "/api/v1/targets") {
        json(response, {
          status: "success",
          data: {
            activeTargets: [
              {
                labels: { job: "real-estate-api" },
                health: "up",
                lastScrape: timestamp,
              },
            ],
          },
        });
        return;
      }
      if (path === "/api/v1/rules") {
        json(response, {
          status: "success",
          data: {
            groups: [
              {
                rules: ["Failed", "Stale", "Stuck"].map((suffix) => ({
                  name: `ListingImageOrphanCleanup${suffix}`,
                  health: "ok",
                  state:
                    state.fault === "firing-alert" && suffix === "Failed"
                      ? "firing"
                      : "inactive",
                  lastEvaluation: timestamp,
                })),
              },
            ],
          },
        });
        return;
      }
      if (path === "/api/v1/alertmanagers") {
        json(response, {
          status: "success",
          data: {
            activeAlertmanagers: [
              { url: "http://alertmanager:9093/api/v2/alerts" },
            ],
          },
        });
        return;
      }
    }
    response.writeHead(404).end();
  }

  async function start(name) {
    const previousPort = services[name]?.port ?? 0;
    const server = createServer((request, response) =>
      handler(name, request, response),
    );
    services[name] = { server, port: previousPort };
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(previousPort, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    services[name].port = server.address().port;
  }

  async function stop(name) {
    const service = services[name];
    if (!service?.server.listening) return;
    await new Promise((resolve, reject) => {
      service.server.close((error) => (error ? reject(error) : resolve()));
      service.server.closeAllConnections();
    });
  }

  const close = () => Promise.all(Object.keys(services).map(stop));
  try {
    for (const name of ["web", "api", "prometheus", "alertmanager"])
      await start(name);
  } catch (error) {
    await close();
    throw error;
  }

  return {
    state,
    environment: Object.fromEntries(
      Object.entries(services).map(([name, service]) => [
        `${name.toUpperCase()}_PORT`,
        String(service.port),
      ]),
    ),
    start,
    stop,
    close,
  };
}
