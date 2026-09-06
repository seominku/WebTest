import assert from "node:assert/strict";

// Never sends a browser gate credential or an application session cookie.
export async function checkPublicBrowsing(origin) {
  const checks = [];
  async function request(path, status = 200, method = "GET") {
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      ...(method === "POST"
        ? {
            headers: { Origin: origin, "Content-Type": "application/json" },
            body: "{}",
          }
        : {}),
    });
    assert.equal(
      response.status,
      status,
      `${method} ${path}: unexpected status`,
    );
    assert.equal(
      response.headers.get("www-authenticate"),
      null,
      "Browser password challenge must be absent",
    );
    checks.push({ path, method, status });
    return response;
  }
  await (await request("/")).arrayBuffer();
  const html = await (await request("/listings")).text();
  assert.match(html, /가상 테스트/);
  const jsPath = html.match(/src="(\/_next\/[^"?]+\.js)(?:[^"]*)"/)?.[1];
  assert.ok(jsPath);
  await (await request(jsPath)).arrayBuffer();
  const list = await (await request("/api/v1/listings")).json();
  assert.ok(
    list.items.length > 0 &&
      list.items.every((item) => item.title.startsWith("[가상 테스트]")),
  );
  const detail = await (
    await request(`/api/v1/listings/${list.items[0].id}`)
  ).json();
  const photo = await request(`/api/v1${detail.imagePaths[0]}`);
  assert.match(photo.headers.get("content-type"), /image\/webp/);
  await photo.arrayBuffer();
  for (const path of [
    "/api/v1/auth/me",
    "/api/v1/auth/csrf",
    "/api/v1/listings/mine",
    "/api/v1/listings/favorites",
  ])
    await (await request(path, 401)).arrayBuffer();
  await (await request("/api/v1/listings", 401, "POST")).arrayBuffer();
  await (
    await request(`/api/v1/listings/${list.items[0].id}`, 401, "PUT")
  ).arrayBuffer();
  for (const path of [
    "/api/v1/health/ready",
    "/api/v1/metrics",
    "/api/v1/admin/metrics",
  ])
    await (await request(path, 404)).arrayBuffer();
  await (await request("/api/v1/auth/register", 404, "POST")).arrayBuffer();
  return checks;
}
