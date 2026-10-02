import { createFileRoute } from "@tanstack/react-router";
import { handleChatTurn } from "@/lib/v1/core/orchestrator.server";
import {
  apiError,
  errorToResponse,
  json,
  readJsonBody,
} from "@/lib/v1/http.server";
import { chatRequestSchema } from "@/lib/v1/types";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;

        const parsed = chatRequestSchema.safeParse(body.value);
        if (!parsed.success) {
          return apiError(
            "invalid_request",
            "The message could not be accepted.",
            400,
            parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          );
        }

        try {
          return json(await handleChatTurn(parsed.data));
        } catch (error) {
          return errorToResponse(error);
        }
      },
    },
  },
});
