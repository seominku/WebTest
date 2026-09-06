import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import {
  listings,
  formatArea,
  groupListings,
} from "../demo/github-pages/data.mjs";

test("sample data is synthetic, fixed and has identical and nearby positions", () => {
  assert.equal(listings.length, 3);
  assert.equal(new Set(listings.map((item) => item.id)).size, 3);
  assert.equal(listings[0].lng, listings[1].lng);
  assert.notEqual(listings[0].lng, listings[2].lng);
  assert.ok(
    listings.every(
      (item) =>
        item.title.includes("샘플") && item.description.includes("가상"),
    ),
  );
});
test("area conversion includes units and approximate pyeong", () => {
  assert.equal(formatArea(59.5, "m2"), "59.5㎡");
  assert.equal(formatArea(59.5, "pyeong"), "약 18.00평");
});
test("zoom separates nearby points without losing colocated listings", () => {
  const project = (scale) => (item) => ({
    x: item.lng * scale,
    y: item.lat * scale,
  });
  assert.deepEqual(
    groupListings(listings, project(1000)).map((group) => group.length),
    [3],
  );
  assert.deepEqual(
    groupListings(listings, project(100000)).map((group) => group.length),
    [2, 1],
  );
  assert.deepEqual(groupListings([], project(1000)), []);
});
test("static demo uses relative assets, no credentials or application API", async () => {
  for (const name of await readdir(
    new URL("../demo/github-pages/", import.meta.url),
  )) {
    const source = await readFile(
      new URL(`../demo/github-pages/${name}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /localhost|trycloudflare|\/api\/v1|agent@example|viewer@example|fetch\s*\(/,
    );
    assert.doesNotMatch(source, /(?:src|href)=["']\/(?!\/)/);
  }
  const html = await readFile(
    new URL("../demo/github-pages/index.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /읽기 전용/);
  assert.match(html, /noindex/);
});
