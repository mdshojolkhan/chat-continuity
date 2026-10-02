import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiError, json, readJsonBody } from "@/lib/v1/http.server";
import { runAiCommand } from "@/lib/v1/providers/commands.server";

const schema = z.object({ command: z.string().trim().min(1).max(200) });

export const Route = createFileRoute("/api/v1/ai/command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        const parsed = schema.safeParse(body.value);
        if (!parsed.success)
          return apiError("invalid_request", "A command is required.", 400);
        const result = runAiCommand(parsed.data.command);
        return json(result, result.ok ? 200 : 400);
      },
    },
  },
});
