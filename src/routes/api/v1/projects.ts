import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { projectStore, workspaceFor } from "@/lib/v1/files/index.server";
import { apiError, errorToResponse, json, readJsonBody } from "@/lib/v1/http.server";
import { assertPermissions } from "@/lib/v1/security/permissions";

const name = z.string().trim().min(1).max(80);
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name }),
  z.object({ action: z.literal("rename"), id, name }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("clear"), id }),
]);

/**
 * Builder projects. Human actions from the Builder panel (like Save/Delete in
 * the Files panel); AI roles never reach this endpoint.
 */
export const Route = createFileRoute("/api/v1/projects")({
  server: {
    handlers: {
      GET: async () => {
        try {
          assertPermissions(["fs:workspace"]);
          return json(await projectStore.list());
        } catch (error) {
          return errorToResponse(error);
        }
      },
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        const parsed = actionSchema.safeParse(body.value);
        if (!parsed.success) return apiError("invalid_request", "That project request is not valid.", 400);
        try {
          assertPermissions(["fs:workspace", "fs:workspace:write"]);
          const a = parsed.data;
          if (a.action === "create") return json(await projectStore.create(a.name));
          if (a.action === "rename") await projectStore.rename(a.id, a.name);
          if (a.action === "delete") await projectStore.remove(a.id);
          if (a.action === "clear") return json({ ok: true, removed: await workspaceFor(a.id).clear() });
          return json({ ok: true });
        } catch (error) {
          return errorToResponse(error);
        }
      },
    },
  },
});
