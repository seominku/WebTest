export function assertDrillOwnership(kind, item, id, run) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(run))
    throw new Error("INVALID_RUN");
  if (!["container", "network", "volume"].includes(kind))
    throw new Error("INVALID_RESOURCE_KIND");
  const labels = kind === "container" ? item.Config?.Labels : item.Labels;
  if (labels?.["app-failure-drill.run"] !== run)
    throw new Error("OWNERSHIP_MISMATCH");
  if (kind !== "volume" && (!/^[a-f0-9]{64}$/.test(item.Id) || item.Id !== id))
    throw new Error("ID_MISMATCH");
  if (
    kind === "volume" &&
    (item.Name !== id ||
      !["postgres", "redis", "minio"].some(
        (service) => id === `app-drill-${run}-${service}`,
      ))
  )
    throw new Error("VOLUME_MISMATCH");
  return item;
}

export function assertDrillIsolation(info, networkName) {
  if (Object.keys(info.HostConfig?.PortBindings ?? {}).length)
    throw new Error("PUBLISHED_PORTS_FORBIDDEN");
  const networks = Object.keys(info.NetworkSettings?.Networks ?? {});
  if (networks.length !== 1 || networks[0] !== networkName)
    throw new Error("NETWORK_MISMATCH");
  if (info.HostConfig?.Privileged || info.HostConfig?.NetworkMode === "host")
    throw new Error("PRIVILEGED_MODE_FORBIDDEN");
  for (const mount of info.Mounts ?? []) {
    if (mount.Type === "bind" && mount.RW)
      throw new Error("WRITABLE_BIND_FORBIDDEN");
  }
}
