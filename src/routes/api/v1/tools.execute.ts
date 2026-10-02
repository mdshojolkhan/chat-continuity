import { createFileRoute } from "@tanstack/react-router";
import {
  apiError,
  errorToResponse,
  json,
  readJsonBody,
} from "@/lib/v1/http.server";
import { toolRegistry } from "@/lib/v1/tools/builtin.server";
import {
  toolExecutionRequestSchema,
  type ToolExecutionResponse,
} from "@/lib/v1/types";

export const Route = createFileRoute("/api/v1/tools/execute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;

        const parsed = toolExecutionRequestSchema.safeParse(body.value);
        if (!parsed.success) {
          return apiError(
            "invalid_request",
            "A skill id and approval state are required.",
            400,
          );
        }

        try {
          const result = await toolRegistry.run(
            parsed.data.toolId,
            parsed.data.input ?? {},
            { conversationId: "settings-panel", aiRole: "user" },
            { approved: parsed.data.approved ?? false },
          );
          const response: ToolExecutionResponse = {
            toolId: parsed.data.toolId,
            executed: true,
            result,
          };
          return json(response);
        } catch (error) {
          return errorToResponse(error);
        }
      },
    },
  },
});
