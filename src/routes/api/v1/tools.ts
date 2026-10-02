import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/v1/http.server";
import { toolRegistry } from "@/lib/v1/tools/builtin.server";

export const Route = createFileRoute("/api/v1/tools")({
  server: {
    handlers: {
      GET: () => json(toolRegistry.listPublic()),
    },
  },
});
