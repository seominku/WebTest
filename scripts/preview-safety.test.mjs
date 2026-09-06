import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertOwned,
  assertIsolated,
  quickOrigin,
  labelKey,
  parsePreviewPasswordInput,
} from "./preview-safety.mjs";
const run = "12345678-1234-4123-8123-123456789abc";
const name = `property-preview-${run}-network`;
test("password input removes PowerShell BOM and transport newline only", () => {
  for (const value of ["1234", "1234\n", "1234\r\n", "\uFEFF1234\r\n"]) {
    assert.equal(parsePreviewPasswordInput(value), "1234");
  }
  assert.equal(parsePreviewPasswordInput(" 1234 \r\n"), " 1234 ");
});
test("password input rejects embedded line breaks and bcrypt byte overflow", () => {
  for (const value of ["123", "1234\n5678", "1234\0", "가".repeat(25)]) {
    assert.throws(() => parsePreviewPasswordInput(value));
  }
});
test("resource ownership refuses original and foreign runs", () => {
  assert.throws(() =>
    assertOwned("volume", { Name: "original", Labels: {} }, "original", run),
  );
  const item = {
    Name: `property-preview-${run}-db`,
    Labels: { [labelKey]: run },
  };
  assert.equal(assertOwned("volume", item, item.Name, run), item);
  assert.throws(() => assertOwned("volume", item, "wrong", run));
});
test("only the gateway may publish one loopback port", () => {
  const item = {
    NetworkSettings: { Networks: { [name]: {} } },
    HostConfig: { Privileged: false },
    Mounts: [],
  };
  assertIsolated(item, name);
  item.HostConfig.PortBindings = {
    "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: "4310" }],
  };
  assert.throws(() => assertIsolated(item, name, true));
  item.HostConfig.PortBindings["8080/tcp"][0].HostIp = "127.0.0.1";
  item.NetworkSettings.Networks[name.replace(/-network$/, "-ingress")] = {};
  assertIsolated(item, name, true);
  item.NetworkSettings.Networks.original = {};
  assert.throws(() => assertIsolated(item, name, true));
});
test("tunnel origin excludes arbitrary hosts and credentials", () => {
  assert.equal(
    quickOrigin("https://example-preview.trycloudflare.com"),
    "https://example-preview.trycloudflare.com",
  );
  for (const value of [
    "http://example.trycloudflare.com",
    "https://example.com",
    "https://a.trycloudflare.com.evil.test",
    "https://u:p@a.trycloudflare.com",
    "https://a.trycloudflare.com/path",
  ])
    assert.throws(() => quickOrigin(value));
});
