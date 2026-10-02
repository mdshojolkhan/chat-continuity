import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/v1/http.server";
import { getModelEngine } from "@/lib/v1/model-engine/index.server";
import { toolRegistry } from "@/lib/v1/tools/builtin.server";
import type { AssistantStatus } from "@/lib/v1/types";

export const Route = createFileRoute("/api/v1/status")({
  server: {
    handlers: {
      GET: () => {
        const engine = getModelEngine();
        const status: AssistantStatus = {
          status: engine.isConfigured() ? "ready" : "degraded",
          provider: engine.provider,
          model: engine.model,
          message: engine.isConfigured()
            ? "Ready to help"
            : "Running on the local fallback engine",
          tools: toolRegistry.list().length,
        };
        return json(status);
      },
    },
  },
});
