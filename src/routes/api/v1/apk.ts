import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getApkBuildStatus, getApkDownload, startApkBuild } from "@/lib/v1/apk/index.server";
import { apiError, errorToResponse, json, readJsonBody } from "@/lib/v1/http.server";
import { assertPermissions } from "@/lib/v1/security/permissions";

const startSchema = z.object({
  action: z.literal("start"),
  projectId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

/**
 * ZIP-to-APK Builder. Human actions from the Builder panel only; AI roles
 * never reach this endpoint. GitHub credentials stay server-side.
 */
export const Route = createFileRoute("/api/v1/apk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        const parsed = startSchema.safeParse(body.value);
        if (!parsed.success) return apiError("invalid_request", "That APK build request is not valid.", 400);
        try {
          assertPermissions(["fs:workspace"]);
          return json(await startApkBuild(parsed.data.projectId));
        } catch (error) {
          return errorToResponse(error);
        }
      },
      GET: async ({ request }) => {
        try {
          assertPermissions(["fs:workspace"]);
          const params = new URL(request.url).searchParams;
          const runId = Number(params.get("runId"));
          if (!Number.isInteger(runId) || runId <= 0) {
            return apiError("invalid_request", "A valid runId is required.", 400);
          }
          if (params.get("download") === "1") {
            const apk = await getApkDownload(runId);
            return new Response(apk as unknown as BodyInit, {
              headers: {
                "Content-Type": "application/vnd.android.package-archive",
                "Content-Disposition": 'attachment; filename="app-debug.apk"',
              },
            });
          }
          return json(await getApkBuildStatus(runId));
        } catch (error) {
          return errorToResponse(error);
        }
      },
    },
  },
});
