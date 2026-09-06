import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalMounts,
  changedEnvironmentKeys,
} from "./deploy-api-local-safety.mjs";

const first = { Type: "volume", Name: "data", Destination: "/data" };
const second = { Type: "bind", Destination: "/config", Source: "not-reported" };
test("Docker mount ordering does not imply a service change", () => {
  assert.deepEqual(
    canonicalMounts([first, second]),
    canonicalMounts([second, first]),
  );
});
test("does not mutate the inspected mount array", () => {
  const mounts = [first, second];
  canonicalMounts(mounts);
  assert.equal(mounts[0], first);
});
test("different data volume is still detected", () => {
  assert.notDeepEqual(
    canonicalMounts([first]),
    canonicalMounts([{ ...first, Name: "other-data" }]),
  );
});
test("different mount destination is still detected", () => {
  assert.notDeepEqual(
    canonicalMounts([first]),
    canonicalMounts([{ ...first, Destination: "/other" }]),
  );
});
test("matches numeric Compose environment values with container strings", () => {
  assert.deepEqual(
    changedEnvironmentKeys(
      { API_PORT: 4000 },
      { API_PORT: "4000", PATH: "/bin" },
    ),
    [],
  );
});
test("detects changed and missing settings without exposing values", () => {
  const result = changedEnvironmentKeys(
    { AUTH_HASH_SECRET: "new-secret", APP_ENV: "local" },
    { AUTH_HASH_SECRET: "old-secret" },
  );
  assert.deepEqual(result, ["APP_ENV", "AUTH_HASH_SECRET"]);
  assert.doesNotMatch(JSON.stringify(result), /new-secret|old-secret/);
});
