import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  getApkBuildStatus,
  getApkDownload,
  loadAndroidConfig,
  saveAndroidConfig,
  startApkBuild,
} from "@/lib/v1/apk/index.server";
import type { AndroidConfig } from "@/lib/v1/apk/config";
import { apiError, errorToResponse, json } from "@/lib/v1/http.server";
import { assertPermissions } from "@/lib/v1/security/permissions";

const projectIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const startSchema = z.object({ action: z.literal("start"), projectId: projectIdSchema });
const saveSchema = z.object({
  action: z.literal("saveConfig"),
  projectId: projectIdSchema,
  config: z.object({
    appName: z.string(),
    packageName: z.string(),
    developerName: z.string(),
    versionName: z.string(),
    versionCode: z.number(),
    icons: z.record(z.string(), z.string()).nullable(),
    adaptiveForeground: z.string().nullable(),
    iconBackground: z.string(),
    splash: z.object({
      enabled: z.boolean(),
      logo: z.string().nullable(),
      backgroundColor: z.string(),
      showAppName: z.boolean(),
    }),
    permissions: z.array(z.string()),
  }),
});
const MAX_CONFIG_BODY = 2 * 1024 * 1024; // settings carry generated icon PNGs

/**
 * ZIP-to-APK Builder. Human actions from the Builder panel only; AI roles
 * never reach this endpoint. GitHub credentials stay server-side.
 */
export const Route = createFileRoute("/api/v1/apk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (raw.length > MAX_CONFIG_BODY) return apiError("invalid_request", "The settings are too large. Use smaller images.", 413);
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          return apiError("invalid_request", "That APK build request is not valid.", 400);
        }
        const save = saveSchema.safeParse(value);
        if (save.success) {
          try {
            assertPermissions(["fs:workspace", "fs:workspace:write"]);
            const config = await saveAndroidConfig(save.data.projectId, save.data.config as AndroidConfig);
            return json({ config });
          } catch (error) {
            return errorToResponse(error);
          }
        }
        const parsed = startSchema.safeParse(value);
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
          const configFor = params.get("config");
          if (configFor !== null) {
            const pid = projectIdSchema.safeParse(configFor);
            if (!pid.success) return apiError("invalid_request", "A valid project is required.", 400);
            return json({ config: await loadAndroidConfig(pid.data) });
          }
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
