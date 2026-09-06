import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const drillDirectory = fileURLToPath(
  new URL("../infrastructure/drill/", import.meta.url),
);

export function validateDrillConfig(config, directory = drillDirectory) {
  assert.equal(config.name, "real-estate-drill", "Wrong Compose project");
  assert.deepEqual(Object.keys(config.services).sort(), [
    "alertmanager",
    "exporter",
    "prometheus",
  ]);
  assert.deepEqual(Object.keys(config.networks), ["drill"]);
  assert.equal(config.networks.drill.internal, true);
  assert.equal(config.networks.drill.name, "real-estate-drill_drill");
  assert.ok(!config.networks.drill.external);
  for (const key of ["volumes", "secrets", "configs"])
    assert.equal(Object.keys(config[key] ?? {}).length, 0);

  const mounts = {
    exporter: { "/drill/metrics.mjs": "metrics.mjs" },
    prometheus: {
      "/etc/prometheus/prometheus.yml": "prometheus.yml",
      "/etc/prometheus/alerts.yml": "alerts.yml",
    },
    alertmanager: { "/etc/alertmanager/alertmanager.yml": "alertmanager.yml" },
  };
  for (const [name, service] of Object.entries(config.services)) {
    for (const key of [
      "build",
      "container_name",
      "network_mode",
      "pid",
      "ipc",
      "devices",
      "volumes_from",
      "env_file",
      "environment",
      "extra_hosts",
      "entrypoint",
      "cap_add",
      "secrets",
      "configs",
    ])
      assert.ok(!service[key], `${name}: unexpected ${key}`);
    assert.ok(!service.privileged);
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ["ALL"]);
    assert.ok(service.security_opt.includes("no-new-privileges:true"));
    assert.equal(service.restart, "no");
    assert.deepEqual(Object.keys(service.networks), ["drill"]);
    assert.equal(service.volumes.length, Object.keys(mounts[name]).length);
    for (const mount of service.volumes) {
      assert.equal(mount.type, "bind");
      assert.equal(mount.read_only, true);
      assert.ok(Object.hasOwn(mounts[name], mount.target));
      assert.equal(
        resolve(mount.source),
        resolve(directory, mounts[name][mount.target]),
      );
    }
    if (name === "exporter") {
      assert.equal((service.ports ?? []).length, 0);
      assert.deepEqual(service.command, ["node", "/drill/metrics.mjs"]);
    } else {
      assert.equal(service.ports.length, 1);
      const port = service.ports[0];
      assert.equal(port.host_ip, "127.0.0.1");
      assert.equal(
        String(port.published),
        name === "prometheus" ? "19090" : "19093",
      );
      assert.equal(port.target, name === "prometheus" ? 9090 : 9093);
    }
  }
  return {
    status: "ok",
    project: config.name,
    services: 3,
    externalNetwork: false,
    persistentVolumes: 0,
    containersStarted: 0,
  };
}

export function loadDrillConfig() {
  const desktopDocker =
    "C:/Program Files/Docker/Docker/resources/bin/docker.exe";
  const docker =
    process.platform === "win32" && existsSync(desktopDocker)
      ? desktopDocker
      : "docker";
  const output = execFileSync(
    docker,
    [
      "compose",
      "--project-directory",
      drillDirectory,
      "-f",
      resolve(drillDirectory, "compose.yml"),
      "--project-name",
      "real-estate-drill",
      "config",
      "--format",
      "json",
    ],
    {
      cwd: dirname(drillDirectory),
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(validateDrillConfig(loadDrillConfig()), null, 2),
    );
  } catch {
    console.error(
      "격리 구성 검증 실패: Docker Compose 설치 또는 훈련 구성의 프로젝트·포트·네트워크·마운트 제한을 확인하세요. 원문 설정은 출력하지 않습니다.",
    );
    process.exitCode = 1;
  }
}
