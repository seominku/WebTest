import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const { output } = JSON.parse(
  await readFile(
    new URL("../.artifacts/pages-original-output.json", import.meta.url),
    "utf8",
  ),
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".txt": "text/plain",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT ?? "4321");
http
  .createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (
        !["GET", "HEAD"].includes(request.method) ||
        !url.pathname.startsWith("/WebTest/")
      ) {
        response.writeHead(404);
        response.end();
        return;
      }
      let file = path.resolve(
        output,
        "." + decodeURIComponent(url.pathname.slice("/WebTest".length)),
      );
      if (
        file !== path.resolve(output) &&
        !file.startsWith(path.resolve(output) + path.sep)
      )
        throw new Error("Outside output");
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      const content = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Original preview: http://127.0.0.1:${port}/WebTest/`),
  );
