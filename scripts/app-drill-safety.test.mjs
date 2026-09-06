import test from "node:test";
import assert from "node:assert/strict";
import {
  assertDrillOwnership,
  assertDrillIsolation,
} from "./app-drill-safety.mjs";
const run = "12345678-1234-1234-1234-123456789abc";
const id = "a".repeat(64);
const Labels = { "app-failure-drill.run": run };
test("accepts exact owned container and network IDs", () => {
  assertDrillOwnership("container", { Id: id, Config: { Labels } }, id, run);
  assertDrillOwnership("network", { Id: id, Labels }, id, run);
});
test("rejects original or foreign container labels", () => {
  assert.throws(
    () =>
      assertDrillOwnership(
        "container",
        {
          Id: id,
          Config: {
            Labels: { "com.docker.compose.project": "real-estate-platform" },
          },
        },
        id,
        run,
      ),
    /OWNERSHIP/,
  );
});
test("rejects mismatched or short resource IDs", () => {
  assert.throws(
    () =>
      assertDrillOwnership("network", { Id: id, Labels }, "b".repeat(64), run),
    /ID_MISMATCH/,
  );
  assert.throws(
    () => assertDrillOwnership("network", { Id: "abc", Labels }, "abc", run),
    /ID_MISMATCH/,
  );
});
test("accepts only exact generated data volume names", () => {
  const name = `app-drill-${run}-postgres`;
  assertDrillOwnership("volume", { Name: name, Labels }, name, run);
  assert.throws(
    () =>
      assertDrillOwnership(
        "volume",
        { Name: "postgres-data", Labels },
        "postgres-data",
        run,
      ),
    /VOLUME/,
  );
});
test("rejects invalid run ID and unknown resource kind", () => {
  assert.throws(
    () => assertDrillOwnership("volume", {}, "", "../"),
    /INVALID_RUN/,
  );
  assert.throws(
    () => assertDrillOwnership("image", {}, "", run),
    /INVALID_RESOURCE_KIND/,
  );
});
const info = () => ({
  HostConfig: {},
  NetworkSettings: { Networks: { drill: {} } },
  Mounts: [{ Type: "bind", RW: false }],
});
test("accepts a single isolated network and read-only bind", () =>
  assertDrillIsolation(info(), "drill"));
test("rejects published ports", () => {
  const value = info();
  value.HostConfig.PortBindings = { "4000/tcp": [] };
  assert.throws(() => assertDrillIsolation(value, "drill"), /PORTS/);
});
test("rejects extra or wrong networks", () => {
  const value = info();
  value.NetworkSettings.Networks.source = {};
  assert.throws(() => assertDrillIsolation(value, "drill"), /NETWORK/);
  assert.throws(() => assertDrillIsolation(info(), "source"), /NETWORK/);
});
test("rejects privileged mode", () => {
  const value = info();
  value.HostConfig.Privileged = true;
  assert.throws(() => assertDrillIsolation(value, "drill"), /PRIVILEGED/);
});
test("rejects writable source bind mounts", () => {
  const value = info();
  value.Mounts[0].RW = true;
  assert.throws(() => assertDrillIsolation(value, "drill"), /WRITABLE/);
});
