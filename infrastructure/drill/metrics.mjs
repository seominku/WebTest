import { createServer } from "node:http";

// Synthetic data only. This process never contacts application services.
const server = createServer((request, response) => {
  if (request.method !== "GET" || request.url !== "/metrics") {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
  response.end("# TYPE drill_fixture_ready gauge\ndrill_fixture_ready 1\n");
});

server.listen(8080, "0.0.0.0");
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
