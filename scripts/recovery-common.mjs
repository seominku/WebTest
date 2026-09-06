import { createHash } from "node:crypto";

export const imageQuery = `SELECT id, listing_id, status::text, object_key, thumbnail_object_key,
  size_bytes, mime_type, width, height, sort_order FROM public.listing_images ORDER BY id`;
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function requireRecovery(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { recoveryCode: code });
}
export function bundleFilename(name) {
  requireRecovery(
    /^(asset|sample)-\d{4,6}\.webp$/.test(name),
    "UNSAFE_BUNDLE_FILENAME",
  );
  return name;
}
export function verifyBytes(bytes, entry) {
  requireRecovery(
    bytes.length === entry.bytes && digest(bytes) === entry.sha256,
    "CONTENT_MISMATCH",
  );
}
export function assertOwnedResource(resource, runId) {
  requireRecovery(/^[0-9a-f-]{36}$/.test(runId), "INVALID_RUN_ID");
  requireRecovery(
    (resource.Config?.Labels ?? resource.Labels)?.["recovery.run"] === runId,
    "RESOURCE_OWNERSHIP_MISMATCH",
  );
  requireRecovery(/^[0-9a-f]{64}$/.test(resource.Id), "INVALID_RESOURCE_ID");
  return resource.Id;
}

export async function captureDatabase(client) {
  await client.query("SET TIME ZONE 'UTC'");
  await client.query("SET DateStyle = 'ISO, YMD'");
  const names = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename COLLATE \"C\"",
    )
  ).rows;
  requireRecovery(names.length > 0 && names.length <= 100, "TABLE_LIMIT");
  const tables = [];
  let totalRows = 0;
  for (const { tablename } of names) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = (
      await client.query(
        `SELECT to_jsonb(t)::text AS payload FROM public.${quoted} t ORDER BY to_jsonb(t)::text COLLATE "C" LIMIT 100001`,
      )
    ).rows;
    totalRows += rows.length;
    requireRecovery(totalRows <= 100000, "ROW_LIMIT");
    tables.push({
      name: tablename,
      rows: rows.length,
      sha256: digest(rows.map((row) => row.payload).join("\n")),
    });
  }
  const images = (await client.query(imageQuery)).rows;
  requireRecovery(images.length <= 1000, "IMAGE_LIMIT");
  requireRecovery(
    !images.some((row) => ["UPLOADED", "SCANNING"].includes(row.status)),
    "IMAGE_PROCESSING_ACTIVE",
  );
  return { tables, images };
}

export function validateObjectCoverage(manifest) {
  const expected = manifest.database.images
    .filter((row) => row.status === "READY")
    .flatMap((row) => [row.object_key, row.thumbnail_object_key])
    .sort();
  const actual = manifest.objects.map((entry) => entry.key).sort();
  requireRecovery(
    expected.length > 0 &&
      expected.every((key) => typeof key === "string" && key.length > 0) &&
      JSON.stringify(expected) === JSON.stringify(actual),
    "OBJECT_COVERAGE_MISMATCH",
  );
  const filenames = [...manifest.objects, ...manifest.samples].map((entry) =>
    bundleFilename(entry.file),
  );
  requireRecovery(
    new Set(filenames).size === filenames.length,
    "DUPLICATE_BUNDLE_FILE",
  );
}
