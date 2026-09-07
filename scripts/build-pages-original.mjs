import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { sampleListings } from "../infrastructure/pages/fixtures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(root, ".artifacts");
await mkdir(artifacts, { recursive: true });
// Fresh, isolated copy. Never change apps/web or include .env/.next/DB/backups.
const stage = await mkdtemp(path.join(artifacts, "pages-original-"));
const web = path.join(stage, "apps/web");
await mkdir(web, { recursive: true });
const sourceRoot = path.join(root, "apps/web/src");
await cp(sourceRoot, path.join(web, "src"), {
  recursive: true,
  filter: (source) =>
    !path.relative(sourceRoot, source).split(path.sep).includes("api"),
});
for (const name of ["package.json", "tsconfig.json", "postcss.config.mjs"]) {
  await copyFile(path.join(root, "apps/web", name), path.join(web, name));
}
await mkdir(path.join(stage, "packages/config"), { recursive: true });
await copyFile(
  path.join(root, "packages/config/tsconfig.base.json"),
  path.join(stage, "packages/config/tsconfig.base.json"),
);
await mkdir(path.join(web, "public/sample-listings"), { recursive: true });
const sampleImages = [
  "seoul-forest-exterior.webp",
  "seoul-forest-living-room.webp",
  "seoul-forest-bedroom.webp",
];
for (const name of sampleImages) {
  await copyFile(
    path.join(root, "apps/web/public/sample-listings", name),
    path.join(web, "public/sample-listings", name),
  );
}
for (const name of ["api.ts", "listings.ts"]) {
  await copyFile(
    path.join(root, "infrastructure/pages", name),
    path.join(web, "src/lib", name),
  );
}
await copyFile(
  path.join(root, "infrastructure/pages/preview-notice.tsx"),
  path.join(web, "src/components/pages-preview-notice.tsx"),
);
await writeFile(
  path.join(web, "src/lib/pages-listings.json"),
  JSON.stringify(sampleListings, null, 2),
);

export function replaceOnce(text, from, to, file) {
  if (text.split(from).length !== 2)
    throw new Error(
      `Original source changed; review Pages adapter for ${file}`,
    );
  return text.replace(from, to);
}
async function adapt(file, transform) {
  const filename = path.join(web, "src", file);
  await writeFile(filename, transform(await readFile(filename, "utf8")));
}
await adapt("app/listings/page.tsx", (text) =>
  replaceOnce(
    text,
    "const raw = (await searchParams) as SearchParams;",
    "const raw: SearchParams = {};",
    "listings searchParams",
  ),
);
await adapt("app/login/page.tsx", (text) =>
  replaceOnce(
    text,
    "const { verified } = await props.searchParams;",
    "const verified: string | undefined = undefined;",
    "login searchParams",
  ),
);
await adapt("app/layout.tsx", (text) => {
  text =
    'import { PagesPreviewNotice } from "@/components/pages-preview-notice";\n' +
    text;
  text = replaceOnce(
    text,
    "<SiteHeader />",
    "<PagesPreviewNotice /><SiteHeader />",
    "layout notice",
  );
  text = replaceOnce(
    text,
    'title: "부동산 매물 플랫폼",',
    'title: "바른매물 | 원본 화면 미리보기", robots: { index: false, follow: false }, icons: { icon: "/WebTest/favicon.ico" },',
    "layout metadata",
  );
  return text;
});
for (const route of [
  "app/listings/[id]/page.tsx",
  "app/agent/listings/[id]/edit/page.tsx",
]) {
  await adapt(
    route,
    (text) =>
      text +
      `\nexport const dynamicParams = false;\nexport function generateStaticParams() { return ${JSON.stringify(sampleListings.map(({ id }) => ({ id })))}; }\n`,
  );
}
await adapt("components/listing-map.tsx", (text) => {
  text = replaceOnce(
    text,
    "href={`/listings/${selectedListing.id}`}",
    "href={`/WebTest/listings/${selectedListing.id}/`}",
    "map detail link",
  );
  text = replaceOnce(
    text,
    "key={category}",
    'key={category} disabled title="주변 시설 조회는 미리보기에서 비활성 상태입니다."',
    "facility controls",
  );
  text = replaceOnce(
    text,
    "주변 시설 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    "원본 화면 미리보기에서는 주변 시설 조회를 제공하지 않습니다.",
    "facility notice",
  );
  const start = text.indexOf("async function fetchOverpassElements(");
  const end = text.indexOf("\ndeclare global", start);
  if (start < 0 || end < 0) throw new Error("Original map structure changed");
  return (
    text.slice(0, start) +
    'async function fetchOverpassElements(_query: string, _signal: AbortSignal): Promise<OverpassElement[]> { throw new Error("원본 화면 미리보기에서는 주변 시설 조회를 제공하지 않습니다."); }\n' +
    text.slice(end)
  );
});
// Explicit source scan: disabled fieldsets preserve the original form markup and
// prevent submissions even before hydration or with JavaScript disabled.
async function adaptTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await adaptTree(file);
      continue;
    }
    if (!/\.(tsx?|css)$/.test(entry.name)) continue;
    let text = await readFile(file, "utf8");
    text = text.replaceAll('"/sample-listings/', '"/WebTest/sample-listings/');
    text = text
      .replace(
        /<form(?=[\s>])/g,
        '<fieldset disabled aria-label="서버 기능 비활성 — 원본 화면 미리보기" className="m-0 min-w-0 border-0 p-0"><form',
      )
      .replaceAll("</form>", "</form></fieldset>");
    await writeFile(file, text);
  }
}
await adaptTree(path.join(web, "src"));
await adapt("app/globals.css", (text) => text + '\n@source "../";\n');
await writeFile(
  path.join(web, "next.config.mjs"),
  `export default { output: "export", basePath: "/WebTest", trailingSlash: true, poweredByHeader: false, images: { unoptimized: true }, transpilePackages: ["@real-estate/shared"] };\n`,
);

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "production",
};
for (const key of Object.keys(env))
  if (key.startsWith("NEXT_PUBLIC_") || key === "API_INTERNAL_BASE_URL")
    delete env[key];
await new Promise((resolve, reject) => {
  const build = spawn(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
    { cwd: web, env, stdio: "inherit", windowsHide: true },
  );
  build.on("error", reject);
  build.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`Next export failed: ${code}`)),
  );
});
const output = path.join(web, "out");
await writeFile(path.join(output, ".nojekyll"), "");
await writeFile(
  path.join(artifacts, "pages-original-output.json"),
  JSON.stringify({ stage, output }, null, 2),
);
if (process.env.GITHUB_OUTPUT)
  await writeFile(process.env.GITHUB_OUTPUT, `path=${output}\n`, { flag: "a" });
console.log(`Original pages exported to ${output}`);
