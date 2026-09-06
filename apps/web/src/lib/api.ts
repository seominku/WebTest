const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new ApiError(errorMessage(body), response.status);
  }

  return body as T;
}

export function apiAssetUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function errorMessage(body: unknown): string {
  if (!body || typeof body !== "object" || !("message" in body)) {
    return "요청을 처리하지 못했습니다.";
  }

  const message = body.message;
  if (Array.isArray(message)) return message.join(" ");
  return typeof message === "string" ? message : "요청을 처리하지 못했습니다.";
}
