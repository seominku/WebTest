import assert from "node:assert/strict";
import test from "node:test";
import {
  imageReferenceFingerprint,
  inspectImageReferences,
  validateRecoveryEnvironment,
} from "./recovery-preflight.mjs";

const rows = () => [
  {
    id: "synthetic",
    status: "READY",
    object_key: "full",
    thumbnail_object_key: "thumb",
    size_bytes: 12,
    mime_type: "image/webp",
  },
];
const head = async (key) => ({
  ContentLength: key === "full" ? 12 : 4,
  ContentType: "image/webp",
});
const environment = () => ({
  DATABASE_URL:
    "postgresql://local:synthetic@localhost:5432/local?schema=public",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_BUCKET: "synthetic",
  S3_REGION: "local",
  S3_ACCESS_KEY: "synthetic",
  S3_SECRET_KEY: "synthetic",
});

test("local settings pass", () => validateRecoveryEnvironment(environment()));
for (const [key, value] of [
  ["DATABASE_URL", "postgresql://example.com/local"],
  ["DATABASE_URL", "postgresql://localhost/local?host=example.com"],
  ["S3_ENDPOINT", "http://example.com:9000"],
  ["S3_ENDPOINT", "http://user:password@localhost:9000"],
  ["S3_ENDPOINT", "http://localhost:9000/path"],
  ["S3_SECRET_KEY", ""],
]) {
  test(`reject unsafe or missing setting ${key}: ${value}`, () => {
    assert.throws(() =>
      validateRecoveryEnvironment({ ...environment(), [key]: value }),
    );
  });
}

test("full and thumbnail metadata match", async () => {
  const result = await inspectImageReferences(rows(), head);
  assert.equal(result.status, "ok");
  assert.equal(result.verifiedObjects, 2);
  assert.equal(result.verifiedBytes, 16);
  assert.ok(!JSON.stringify(result).includes("synthetic"));
});
test("empty inventory is not a successful photo recovery", async () => {
  assert.equal(
    (await inspectImageReferences([], head)).status,
    "no_ready_images",
  );
});
test("missing thumbnail reference fails", async () => {
  const input = rows();
  input[0].thumbnail_object_key = null;
  assert.equal(
    (await inspectImageReferences(input, head)).issues
      .thumbnail_reference_missing,
    1,
  );
});
for (const status of [404, 403, 500]) {
  test(`storage error ${status} is counted without raw error output`, async () => {
    const result = await inspectImageReferences(rows(), async () => {
      throw Object.assign(new Error("secret"), {
        $metadata: { httpStatusCode: status },
      });
    });
    assert.equal(result.status, "needs_attention");
    assert.equal(
      Object.values(result.issues).reduce((a, b) => a + b, 0),
      2,
    );
    assert.ok(!JSON.stringify(result).includes("secret"));
  });
}
test("wrong size and type fail", async () => {
  const result = await inspectImageReferences(rows(), async (key) => ({
    ContentLength: key === "full" ? 1 : 4,
    ContentType: "text/plain",
  }));
  assert.equal(result.issues.full_size_mismatch, 1);
  assert.equal(result.issues.thumbnail_type_mismatch, 1);
});
test("in-progress images block a stable backup preflight", async () => {
  const result = await inspectImageReferences(
    [...rows(), { status: "SCANNING" }],
    head,
  );
  assert.equal(result.status, "needs_attention");
  assert.equal(result.inProgressImages, 1);
});
test("changed references produce a different metadata fingerprint", () => {
  const before = rows();
  const after = rows();
  after[0].object_key = "replacement";
  assert.notEqual(
    imageReferenceFingerprint(before),
    imageReferenceFingerprint(after),
  );
});
test("inventory limit is checked before storage calls", async () => {
  await assert.rejects(
    inspectImageReferences(Array(10001).fill(rows()[0]), () => assert.fail()),
    /limit/,
  );
});
