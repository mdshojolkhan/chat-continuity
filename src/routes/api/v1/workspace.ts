import { createFileRoute } from "@tanstack/react-router";
import { workspaceStore } from "@/lib/v1/files/index.server";
import {
  apiError,
  errorToResponse,
  json,
  readJsonBody,
} from "@/lib/v1/http.server";
import { assertPermissions } from "@/lib/v1/security/permissions";
import { toolRegistry } from "@/lib/v1/tools/builtin.server";
import {
  workspaceDeleteRequestSchema,
  type WorkspaceFileSummary,
} from "@/lib/v1/types";

export const Route = createFileRoute("/api/v1/workspace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          assertPermissions(["fs:workspace"]);
          const path = new URL(request.url).searchParams.get("path");
          if (path) {
            const file = await workspaceStore.read(path);
            if (!file) return apiError("invalid_request", "File not found.", 404);
            return json({ path: file.path, content: file.content });
          }
          const files = await workspaceStore.list();
          const summaries: WorkspaceFileSummary[] = files.map((file) => ({
            path: file.path,
            bytes: file.bytes,
            updatedAt: file.updatedAt,
          }));
          return json(summaries);
        } catch (error) {
          return errorToResponse(error);
        }
      },
      PUT: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        try {
          // Saving goes through the registry's file_write skill (validation + permissions).
          // This is a direct human action from the editor, so it runs as the
          // "user" role. Without it the registry defaulted to "helper", which is
          // denied fs:workspace:write — that was the "Save failed" cause.
          const result = await toolRegistry.run("file_write", body.value, {
            conversationId: "workspace-panel",
            aiRole: "user",
          });
          const path = (body.value as { path?: unknown })?.path;
          const saved =
            typeof path === "string" ? await workspaceStore.read(path) : null;
          return json({
            ok: true,
            result,
            file: saved
              ? { path: saved.path, bytes: saved.bytes, updatedAt: saved.updatedAt }
              : null,
          });
        } catch (error) {
          return errorToResponse(error);
        }
      },
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;

        const parsed = workspaceDeleteRequestSchema.safeParse(body.value);
        if (!parsed.success) {
          return apiError(
            "invalid_request",
            "A workspace file path is required.",
            400,
          );
        }

        try {
          // Deletion always goes through the registry: schema validation,
          // permission assertion and approval gating stay in one place.
          // Like Save, this endpoint is the human Files-panel action, so the
          // server (never the client) assigns the "user" role here.
          const result = await toolRegistry.run(
            "file_delete",
            { path: parsed.data.path },
            { conversationId: "workspace-panel", aiRole: "user" },
            { approved: true },
          );
          return json({ ok: true, result });
        } catch (error) {
          return errorToResponse(error);
        }
      },
    },
  },
});
