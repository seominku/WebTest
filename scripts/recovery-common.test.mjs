import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  bundleFilename,
  digest,
  verifyBytes,
  assertOwnedResource,
  validateObjectCoverage,
} from "./recovery-common.mjs";

test("valid byte checksum matches", () => {
  const bytes = Buffer.from("synthetic");
  verifyBytes(bytes, { bytes: bytes.length, sha256: digest(bytes) });
});
test("changed bytes of the same size are detected", () => {
  assert.throws(
    () =>
      verifyBytes(Buffer.from("bad"), {
        bytes: 3,
        sha256: digest(Buffer.from("old")),
      }),
    /CONTENT_MISMATCH/,
  );
});
for (const file of [
  "../source.webp",
  "/absolute.webp",
  "C:\\source.webp",
  "asset-0001.webp/../../x",
  "manifest.json",
]) {
  test(`reject unsafe bundle filename ${file}`, () =>
    assert.throws(() => bundleFilename(file), /UNSAFE/));
}
test("generated bundle filename passes", () =>
  assert.equal(bundleFilename("asset-0001.webp"), "asset-0001.webp"));
test("owned container and network IDs pass", () => {
  const run = randomUUID();
  for (const labels of [
    { Config: { Labels: { "recovery.run": run } } },
    { Labels: { "recovery.run": run } },
  ]) {
    assert.equal(
      assertOwnedResource({ Id: "a".repeat(64), ...labels }, run),
      "a".repeat(64),
    );
  }
});
test("source or different run resource cannot be cleaned", () => {
  assert.throws(
    () =>
      assertOwnedResource(
        {
          Id: "a".repeat(64),
          Config: { Labels: { "recovery.run": randomUUID() } },
        },
        randomUUID(),
      ),
    /OWNERSHIP/,
  );
});
const manifest = () => ({
  database: {
    images: [
      { status: "READY", object_key: "full", thumbnail_object_key: "thumb" },
    ],
  },
  objects: [
    { key: "full", file: "asset-0001.webp" },
    { key: "thumb", file: "asset-0002.webp" },
  ],
  samples: [],
});
test("all READY references must be included", () =>
  validateObjectCoverage(manifest()));
test("omitted thumbnail cannot pass", () => {
  const input = manifest();
  input.objects.pop();
  assert.throws(() => validateObjectCoverage(input), /COVERAGE/);
});
test("unexpected object cannot pass", () => {
  const input = manifest();
  input.objects.push({ key: "extra", file: "asset-0003.webp" });
  assert.throws(() => validateObjectCoverage(input), /COVERAGE/);
});
test("duplicate local filenames cannot overwrite assets", () => {
  const input = manifest();
  input.objects[1].file = input.objects[0].file;
  assert.throws(() => validateObjectCoverage(input), /DUPLICATE/);
});
