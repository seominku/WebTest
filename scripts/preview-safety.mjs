import assert from "node:assert/strict";
export const labelKey = "real-estate-preview.run";
// PowerShell may prefix native stdin with a UTF-8 byte-order mark.
// Remove the transport marker, not intentional spaces in the password.
export function parsePreviewPasswordInput(input) {
  const password = input.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  assert.ok(
    password.length >= 4 &&
      password.length <= 64 &&
      Buffer.byteLength(password, "utf8") <= 72 &&
      !/[\r\n\0]/.test(password),
    "INVALID_PREVIEW_PASSWORD_INPUT",
  );
  return password;
}
export function validRun(run) {
  assert.match(
    run,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  return run;
}
export function assertOwned(kind, item, id, run) {
  validRun(run);
  const labels = kind === "container" ? item.Config?.Labels : item.Labels;
  assert.equal(labels?.[labelKey], run);
  assert.equal(kind === "volume" ? item.Name : item.Id, id);
  assert.ok(
    (item.Name ?? "").replace(/^\//, "").startsWith(`property-preview-${run}-`),
  );
  return item;
}
export function assertIsolated(item, networkName, gateway = false) {
  assert.deepEqual(
    Object.keys(item.NetworkSettings.Networks).sort(),
    (gateway
      ? [networkName, networkName.replace(/-network$/, "-ingress")]
      : [networkName]
    ).sort(),
  );
  assert.equal(item.HostConfig.Privileged, false);
  const ports = Object.entries(item.HostConfig.PortBindings ?? {});
  if (gateway)
    assert.deepEqual(ports, [
      ["8080/tcp", [{ HostIp: "127.0.0.1", HostPort: "4310" }]],
    ]);
  else assert.equal(ports.length, 0);
  for (const mount of item.Mounts ?? []) {
    if (mount.Type === "volume")
      assert.ok(mount.Name.startsWith(networkName.replace(/-network$/, "-")));
    else assert.equal(mount.RW, false);
  }
}
export function quickOrigin(value) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.match(url.hostname, /^[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/);
  assert.equal(url.href, `${url.origin}/`);
  return url.origin;
}
