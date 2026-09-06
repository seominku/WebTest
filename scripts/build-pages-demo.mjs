import { copyFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, ".artifacts/github-pages");
// Explicit allowlist: do not upload the repository, .env, backups or live data.
await mkdir(path.join(output, "assets"), { recursive: true });
for (const name of ["index.html", "style.css", "app.mjs", "data.mjs"]) {
  await copyFile(
    path.join(root, "demo/github-pages", name),
    path.join(output, name),
  );
}
for (const name of [
  "seoul-forest-living-room.webp",
  "seoul-forest-exterior.webp",
  "seoul-forest-bedroom.webp",
]) {
  await copyFile(
    path.join(root, "apps/web/public/sample-listings", name),
    path.join(output, "assets", name),
  );
}
const expected = ["app.mjs", "assets", "data.mjs", "index.html", "style.css"];
const actual = (await readdir(output)).sort();
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error("Unexpected files in Pages output; refusing deployment.");
const assets = (await readdir(path.join(output, "assets"))).sort();
if (
  JSON.stringify(assets) !==
  JSON.stringify([
    "seoul-forest-bedroom.webp",
    "seoul-forest-exterior.webp",
    "seoul-forest-living-room.webp",
  ])
)
  throw new Error("Unexpected assets; refusing deployment.");
console.log(
  "GitHub Pages demo built: .artifacts/github-pages (7 public files only)",
);
