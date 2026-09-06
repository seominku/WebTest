import assert from "node:assert/strict";
import test from "node:test";
import { loadDrillConfig, validateDrillConfig } from "./drill-config-check.mjs";

const baseline = loadDrillConfig();
test("standalone drill Compose passes without starting containers", () => {
  assert.equal(validateDrillConfig(baseline).containersStarted, 0);
});

const mutations = [
  [
    "application project",
    (c) => {
      c.name = "real-estate-platform";
    },
  ],
  [
    "external network",
    (c) => {
      c.networks.drill.internal = false;
    },
  ],
  [
    "shared network name",
    (c) => {
      c.networks.drill.name = "real-estate-platform_backend";
    },
  ],
  [
    "public port",
    (c) => {
      c.services.prometheus.ports[0].host_ip = "0.0.0.0";
    },
  ],
  [
    "application port",
    (c) => {
      c.services.prometheus.ports[0].published = "9090";
    },
  ],
  [
    "persistent volume",
    (c) => {
      c.volumes = { "postgres-data": {} };
    },
  ],
  [
    "environment injection",
    (c) => {
      c.services.exporter.environment = { DATABASE_URL: "synthetic" };
    },
  ],
  [
    "host networking",
    (c) => {
      c.services.exporter.network_mode = "host";
    },
  ],
  [
    "privilege escalation",
    (c) => {
      c.services.exporter.privileged = true;
    },
  ],
  [
    "writable mount",
    (c) => {
      c.services.exporter.volumes[0].read_only = false;
    },
  ],
  [
    "different mount source",
    (c) => {
      c.services.exporter.volumes[0].source += ".unexpected";
    },
  ],
  [
    "extra service",
    (c) => {
      c.services.postgres = {};
    },
  ],
  [
    "different exporter command",
    (c) => {
      c.services.exporter.command = ["node", "/app/main.js"];
    },
  ],
];
for (const [name, mutate] of mutations) {
  test(`reject ${name}`, () => {
    const config = structuredClone(baseline);
    mutate(config);
    assert.throws(() => validateDrillConfig(config));
  });
}
