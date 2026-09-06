import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  link,
  rename,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { digest } from "./recovery-common.mjs";
import {
  loadRecoveryBundle,
  parseRecoveryArguments,
} from "./recovery-bundle-input.mjs";

async function fixture(t) {
  const workspace = await mkdtemp(resolve(tmpdir(), "recovery-input-test-"));
  t.after(async () => {
    assert.equal(dirname(workspace), resolve(tmpdir()));
    assert.ok(basename(workspace).startsWith("recovery-input-test-"));
    await rm(workspace, { recursive: true, force: true });
  });
  const runId = randomUUID();
  const directory = resolve(workspace, "backups", `recovery-${runId}`);
  await mkdir(directory, { recursive: true });
  const dump = Buffer.from("PGDMP synthetic unit-test dump, never restored");
  const asset = Buffer.from("synthetic bytes, never decoded");
  const manifest = {
    format: 1,
    backupComplete: true,
    runId,
    dumpSha256: digest(dump),
    database: {
      tables: [{ name: "listing_images", rows: 1, sha256: digest("row") }],
      images: [
        { status: "READY", object_key: "full", thumbnail_object_key: "thumb" },
      ],
    },
    objects: ["full", "thumb"].map((key, index) => ({
      key,
      file: `asset-000${index + 1}.webp`,
      bytes: asset.length,
      sha256: digest(asset),
    })),
    samples: [],
  };
  const save = () =>
    writeFile(resolve(directory, "manifest.json"), JSON.stringify(manifest));
  await save();
  await writeFile(resolve(directory, "database.dump"), dump);
  for (const entry of manifest.objects)
    await writeFile(resolve(directory, entry.file), asset);
  return { workspace, directory, manifest, save };
}

test("backup argument selects source-free mode", () =>
  assert.deepEqual(
    parseRecoveryArguments(["--from-backup", "backups/recovery-example"]),
    { restoreOnly: true, input: "backups/recovery-example" },
  ));
test("no arguments retain capture-and-restore mode", () =>
  assert.deepEqual(parseRecoveryArguments([]), { restoreOnly: false }));
for (const args of [
  ["--from-backup"],
  ["--unknown", "folder"],
  ["--from-backup", "folder", "extra"],
]) {
  test(`reject invalid arguments ${args.join(" ")}`, () =>
    assert.throws(() => parseRecoveryArguments(args), /ARGUMENTS/));
}
test("valid bundle loads without .env and without writing input", async (t) => {
  const f = await fixture(t);
  const before = await readFile(resolve(f.directory, "manifest.json"));
  const result = await loadRecoveryBundle(f.workspace, f.directory);
  assert.equal(result.verifiedFiles, 4);
  assert.deepEqual(
    await readFile(resolve(f.directory, "manifest.json")),
    before,
  );
  assert.equal(
    (await loadRecoveryBundle(f.workspace, f.directory)).fingerprint,
    result.fingerprint,
  );
});
test("external path is rejected before any file access", async () => {
  await assert.rejects(
    loadRecoveryBundle(
      resolve(tmpdir(), "unused-workspace"),
      resolve(tmpdir(), "outside"),
    ),
    /OUTSIDE/,
  );
});
for (const [name, mutate, expected] of [
  [
    "incomplete manifest",
    (m) => {
      m.backupComplete = false;
    },
    /MANIFEST/,
  ],
  [
    "run ID mismatch",
    (m) => {
      m.runId = randomUUID();
    },
    /MANIFEST/,
  ],
  [
    "missing referenced thumbnail",
    (m) => {
      m.objects.pop();
    },
    /COVERAGE/,
  ],
  [
    "path traversal",
    (m) => {
      m.objects[0].file = "../secret";
    },
    /UNSAFE/,
  ],
  [
    "processing state",
    (m) => {
      m.database.images[0].status = "SCANNING";
    },
    /STATES/,
  ],
  [
    "oversized asset",
    (m) => {
      m.objects[0].bytes = 17 * 1024 * 1024;
    },
    /METADATA/,
  ],
]) {
  test(`reject ${name}`, async (t) => {
    const f = await fixture(t);
    mutate(f.manifest);
    await f.save();
    await assert.rejects(
      loadRecoveryBundle(f.workspace, f.directory),
      expected,
    );
  });
}
test("corrupted dump fails before Docker", async (t) => {
  const f = await fixture(t);
  await writeFile(resolve(f.directory, "database.dump"), "PGDMP changed");
  await assert.rejects(
    loadRecoveryBundle(f.workspace, f.directory),
    /DUMP_MISMATCH/,
  );
});
test("missing file fails before Docker", async (t) => {
  const f = await fixture(t);
  await rm(resolve(f.directory, "asset-0002.webp"));
  await assert.rejects(loadRecoveryBundle(f.workspace, f.directory), {
    code: "ENOENT",
  });
});
test("same-sized corrupt asset fails", async (t) => {
  const f = await fixture(t);
  await writeFile(
    resolve(f.directory, "asset-0001.webp"),
    Buffer.alloc(f.manifest.objects[0].bytes),
  );
  await assert.rejects(
    loadRecoveryBundle(f.workspace, f.directory),
    /CONTENT_MISMATCH/,
  );
});
test("hard-linked asset is rejected", async (t) => {
  const f = await fixture(t);
  await link(
    resolve(f.directory, "asset-0001.webp"),
    resolve(f.workspace, "linked-copy"),
  );
  await assert.rejects(
    loadRecoveryBundle(f.workspace, f.directory),
    /UNSAFE_BACKUP_FILE/,
  );
});
test("redirected bundle directory is rejected", async (t) => {
  const f = await fixture(t);
  const moved = resolve(f.workspace, "redirected");
  await rename(f.directory, moved);
  await symlink(moved, f.directory, "junction");
  await assert.rejects(
    loadRecoveryBundle(f.workspace, f.directory),
    /UNSAFE_BACKUP_DIRECTORY/,
  );
});

test("source guard actually blocks parent TCP connections", async () => {
  const preload = new URL(
    "./fixtures/recovery-source-deny.mjs",
    import.meta.url,
  ).href;
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      preload,
      "--input-type=module",
      "-e",
      "import net from 'node:net'; try { net.connect({host:'127.0.0.1',port:9}); process.exitCode=1; } catch(error) { if(error.recoveryCode !== 'SOURCE_TCP_ACCESS_FORBIDDEN') process.exitCode=1; else console.log('TCP_GUARD_CONFIRMED'); }",
    ],
    { windowsHide: true, timeout: 5000 },
  );
  assert.match(stdout, /TCP_GUARD_CONFIRMED/);
});
