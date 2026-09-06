import type { HealthResponse } from "@real-estate/shared";

export const dynamic = "force-dynamic";

export function GET() {
  const body: HealthResponse = {
    service: "web",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
