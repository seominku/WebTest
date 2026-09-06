// Local backup validation only: no .env, source database or source storage access.
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import {
  digest,
  requireRecovery,
  validateObjectCoverage,
  verifyBytes,
} from "./recovery-common.mjs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const checksum = /^[0-9a-f]{64}$/;
const samePath = (left, right) =>
  process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;

export function parseRecoveryArguments(args) {
  if (args.length === 0) return { restoreOnly: false };
  requireRecovery(
    args.length === 2 && args[0] === "--from-backup" && Boolean(args[1]),
    "RECOVERY_ARGUMENTS",
  );
  return { restoreOnly: true, input: args[1] };
}

async function regularFile(path, limit) {
  const info = await lstat(path);
  requireRecovery(
    info.isFile() && !info.isSymbolicLink() && info.nlink === 1,
    "UNSAFE_BACKUP_FILE",
  );
  requireRecovery(info.size > 0 && info.size <= limit, "BACKUP_FILE_LIMIT");
  const bytes = await readFile(path);
  requireRecovery(bytes.length === info.size, "BACKUP_FILE_CHANGED");
  return bytes;
}

export async function loadRecoveryBundle(workspace, input) {
  const directory = resolve(workspace, input);
  const backups = resolve(workspace, "backups");
  requireRecovery(
    samePath(dirname(directory), backups),
    "BACKUP_OUTSIDE_ALLOWED_DIRECTORY",
  );
  const runId = basename(directory).replace(/^recovery-/, "");
  requireRecovery(
    basename(directory) === `recovery-${runId}` && uuid.test(runId),
    "INVALID_BACKUP_DIRECTORY",
  );
  for (const path of [backups, directory]) {
    const info = await lstat(path);
    requireRecovery(
      info.isDirectory() && !info.isSymbolicLink(),
      "UNSAFE_BACKUP_DIRECTORY",
    );
  }
  requireRecovery(
    samePath(
      await realpath(backups),
      resolve(await realpath(workspace), "backups"),
    ) &&
      samePath(
        await realpath(directory),
        resolve(await realpath(backups), basename(directory)),
      ),
    "UNSAFE_BACKUP_DIRECTORY",
  );

  const manifestBytes = await regularFile(
    resolve(directory, "manifest.json"),
    2 * 1024 * 1024,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    requireRecovery(false, "INVALID_MANIFEST");
  }
  requireRecovery(
    manifest?.format === 1 &&
      manifest.backupComplete === true &&
      manifest.runId === runId &&
      checksum.test(manifest.dumpSha256),
    "INVALID_MANIFEST",
  );
  requireRecovery(
    Array.isArray(manifest.database?.tables) &&
      manifest.database.tables.length > 0 &&
      manifest.database.tables.length <= 100 &&
      Array.isArray(manifest.database.images) &&
      manifest.database.images.length <= 1000 &&
      Array.isArray(manifest.objects) &&
      manifest.objects.length > 0 &&
      manifest.objects.length <= 2000 &&
      Array.isArray(manifest.samples) &&
      manifest.samples.length <= 100,
    "INVALID_MANIFEST",
  );
  let rowCount = 0;
  for (const table of manifest.database.tables) {
    requireRecovery(
      typeof table?.name === "string" &&
        Number.isSafeInteger(table.rows) &&
        table.rows >= 0 &&
        checksum.test(table.sha256),
      "INVALID_MANIFEST",
    );
    rowCount += table.rows;
  }
  requireRecovery(
    rowCount <= 100000 &&
      new Set(manifest.database.tables.map((table) => table.name)).size ===
        manifest.database.tables.length,
    "INVALID_MANIFEST",
  );
  requireRecovery(
    manifest.database.images.every(
      (row) => row && ["READY", "REJECTED"].includes(row.status),
    ),
    "INCOMPLETE_IMAGE_STATES",
  );
  validateObjectCoverage(manifest);
  const files = [{ file: "manifest.json", sha256: digest(manifestBytes) }];
  const dump = await regularFile(
    resolve(directory, "database.dump"),
    128 * 1024 * 1024,
  );
  requireRecovery(
    dump.subarray(0, 5).toString() === "PGDMP" &&
      digest(dump) === manifest.dumpSha256,
    "DUMP_MISMATCH",
  );
  files.push({ file: "database.dump", sha256: digest(dump) });
  let totalBytes = 0;
  for (const [kind, entries] of [
    ["asset", manifest.objects],
    ["sample", manifest.samples],
  ]) {
    for (const entry of entries) {
      requireRecovery(
        entry.file.startsWith(`${kind}-`) &&
          Number.isSafeInteger(entry.bytes) &&
          entry.bytes > 0 &&
          entry.bytes <= 16 * 1024 * 1024 &&
          checksum.test(entry.sha256),
        "INVALID_ASSET_METADATA",
      );
      totalBytes += entry.bytes;
      requireRecovery(totalBytes <= 256 * 1024 * 1024, "BACKUP_SIZE_LIMIT");
      const bytes = await regularFile(
        resolve(directory, entry.file),
        16 * 1024 * 1024,
      );
      verifyBytes(bytes, entry);
      files.push({ file: entry.file, sha256: digest(bytes) });
    }
  }
  return {
    directory,
    manifest,
    fingerprint: digest(JSON.stringify(files)),
    verifiedFiles: files.length,
  };
}
