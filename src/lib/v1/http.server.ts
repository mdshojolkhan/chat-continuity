/**
 * HTTP helpers shared by the V1 API routes: JSON responses, request-size limits
 * and consistent error mapping. No route may leak internals to the client.
 */
import { ModelEngineError } from "./model-engine/engine";
import { PermissionDeniedError } from "./security/permissions";
import { ToolError } from "./tools/registry";
import type { ApiError } from "./types";

const MAX_BODY_BYTES = 64 * 1024;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function apiError(
  code: ApiError["code"],
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ApiError = details === undefined
    ? { error: message, code }
    : { error: message, code, details };
  return json(body, status);
}

/** Reads and parses a JSON body with a hard size limit. */
export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      response: apiError(
        "invalid_request",
        "Content-Type must be application/json.",
        415,
      ),
    };
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: apiError("invalid_request", "Request body is too large.", 413),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: apiError("invalid_request", "Body must be valid JSON.", 400),
    };
  }
}

export function errorToResponse(error: unknown): Response {
  if (error instanceof Error && error.name === "ProviderRoleError") {
    return apiError("invalid_request", error.message, 400);
  }
  if (error instanceof Error && error.name === "WorkspacePathError") {
    return apiError("invalid_request", error.message, 400);
  }
  if (error instanceof Error && error.name === "WorkspaceStorageError") {
    return apiError("internal_error", error.message, 503);
  }
  if (error instanceof ModelEngineError) {
    switch (error.code) {
      case "rate_limited":
        return apiError("rate_limited", error.message, 429);
      case "payment_required":
        return apiError("payment_required", error.message, 402);
      case "forbidden":
        return apiError("forbidden", error.message, 403);
      case "invalid_request":
        return apiError("invalid_request", error.message, 400);
      default:
        return apiError("model_unavailable", error.message, 503);
    }
  }
  if (error instanceof PermissionDeniedError) {
    return apiError("forbidden", "This skill is not permitted yet.", 403);
  }
  if (error instanceof ToolError) {
    const status =
      error.code === "not_found"
        ? 404
        : error.code === "not_approved"
          ? 403
          : 400;
    return apiError(
      error.code === "not_found" ? "invalid_request" : "forbidden",
      error.message,
      status,
    );
  }
  console.error("[v1] unhandled error", error);
  return apiError("internal_error", "Something went wrong on our side.", 500);
}
