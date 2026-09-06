// Test-only preload. Forbids the parent verifier from reading .env or opening TCP.
// Docker subprocesses may still use the local Docker daemon and isolated services.
import fs from "node:fs";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

const check = (path) => {
  if (/(^|[\\/])\.env(?:$|\.)/.test(String(path))) {
    throw Object.assign(new Error("SOURCE_ENV_ACCESS_FORBIDDEN"), {
      recoveryCode: "SOURCE_ENV_ACCESS_FORBIDDEN",
    });
  }
};
const readSync = fs.readFileSync;
fs.readFileSync = function (path, ...args) {
  check(path);
  return readSync.call(this, path, ...args);
};
const readAsync = fs.promises.readFile;
fs.promises.readFile = function (path, ...args) {
  check(path);
  return readAsync.call(this, path, ...args);
};
net.Socket.prototype.connect = function () {
  throw Object.assign(new Error("SOURCE_TCP_ACCESS_FORBIDDEN"), {
    recoveryCode: "SOURCE_TCP_ACCESS_FORBIDDEN",
  });
};
syncBuiltinESMExports();
console.log(JSON.stringify({ testGuard: "source_env_and_parent_tcp_denied" }));
