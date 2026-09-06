export function canonicalMounts(mounts) {
  return mounts
    .map((mount) => ({
      type: mount.Type,
      name: mount.Name,
      destination: mount.Destination,
    }))
    .sort((a, b) => a.destination.localeCompare(b.destination));
}

export function changedEnvironmentKeys(wanted, actual) {
  // Return key names only: callers must never log credential values.
  return Object.entries(wanted)
    .filter(([key, value]) => actual[key] !== String(value))
    .map(([key]) => key)
    .sort();
}
