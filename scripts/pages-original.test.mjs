import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir, access } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { sampleListings } from "../infrastructure/pages/fixtures.mjs";

test("public fixtures contain only synthetic records and overlapping coordinates", () => {
  assert.equal(sampleListings.length, 3);
  assert.equal(new Set(sampleListings.map((item) => item.id)).size, 3);
  assert.equal(
    sampleListings[0].location.longitude,
    sampleListings[1].location.longitude,
  );
  assert.notEqual(
    sampleListings[1].location.longitude,
    sampleListings[2].location.longitude,
  );
  for (const item of sampleListings) {
    assert.match(item.title, /가상/);
    assert.match(item.agency.registrationNumber, /가상/);
    assert.equal(item.agency.phone, "연락처 없음");
  }
});
test("preview API blocks auth and writes without calling fetch", async () => {
  const source = await readFile(
    new URL("../infrastructure/pages/api.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let requests = 0;
  const context = {
    exports: {},
    require: (name) => {
      assert.equal(name, "./pages-listings.json");
      return sampleListings;
    },
    fetch: () => {
      requests++;
      throw new Error("Unexpected network");
    },
  };
  vm.runInNewContext(js, context);
  const api = context.exports;
  for (const route of [
    "/auth/me",
    "/auth/login",
    "/auth/register",
    "/agent/listings",
  ]) {
    await assert.rejects(api.apiRequest(route, { method: "POST" }), {
      status: 503,
    });
  }
  await assert.rejects(
    api.apiRequest(`/listings/${sampleListings[0].id}`, { method: "DELETE" }),
    { status: 503 },
  );
  assert.equal(
    (await api.apiRequest(`/listings/${sampleListings[0].id}`)).id,
    sampleListings[0].id,
  );
  assert.equal(requests, 0);
});
test("original source adapters still match the explicitly supported source structure", async () => {
  for (const [file, token] of [
    [
      "app/listings/page.tsx",
      "const raw = (await searchParams) as SearchParams;",
    ],
    ["app/login/page.tsx", "const { verified } = await props.searchParams;"],
    ["app/layout.tsx", "<SiteHeader />"],
    ["components/listing-map.tsx", "async function fetchOverpassElements("],
  ]) {
    const text = await readFile(
      new URL(`../apps/web/src/${file}`, import.meta.url),
      "utf8",
    );
    assert.equal(text.split(token).length, 2, file);
    assert.doesNotMatch(
      text,
      /PagesPreviewNotice|disabled aria-label="서버 기능 비활성/,
    );
  }
});
if (process.env.CHECK_PAGES_OUTPUT === "1") {
  test("export contains original routes, disabled forms and only safe static assets", async () => {
    const { output } = JSON.parse(
      await readFile(
        new URL("../.artifacts/pages-original-output.json", import.meta.url),
        "utf8",
      ),
    );
    const htmlFiles = [];
    async function walk(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        assert.ok(!entry.isSymbolicLink(), entry.name);
        assert.doesNotMatch(
          entry.name,
          /^\.env|\.map$|\.sql$|\.pem$|\.hwp$|\.zip$|^backups$|^api$/i,
        );
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (file.endsWith(".html")) htmlFiles.push(file);
      }
    }
    await walk(output);
    for (const route of [
      "",
      "listings",
      "login",
      "register",
      "recent",
      `listings/${sampleListings[0].id}`,
    ]) {
      await access(path.join(output, route, "index.html"));
    }
    const home = await readFile(path.join(output, "index.html"), "utf8");
    assert.match(home, /좋은 매물을 찾는 과정도/);
    assert.doesNotMatch(home, /집을 찾는 시간|EXPLORE YOUR NEXT HOME/);
    for (const file of htmlFiles) {
      const html = await readFile(file, "utf8");
      assert.match(html, /원본 화면 미리보기/);
      assert.doesNotMatch(
        html,
        /localhost:4000|trycloudflare\.com|agent@example\.test/,
      );
      assert.equal(
        (html.match(/<form\b/g) ?? []).length,
        (html.match(/<fieldset disabled=""/g) ?? []).length,
        file,
      );
      for (const match of html.matchAll(/(?:src|href)="(\/(?!\/)[^"]+)"/g)) {
        assert.ok(match[1].startsWith("/WebTest/"), `${file}: ${match[1]}`);
      }
    }
    assert.ok(htmlFiles.length >= 20);
    console.log(`Validated ${htmlFiles.length} original HTML pages`);
  });
}
