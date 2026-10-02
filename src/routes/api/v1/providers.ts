import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { apiError, errorToResponse, json, readJsonBody } from "@/lib/v1/http.server";
import {
  listProviders,
  removeProvider,
  testProvider,
  updateProvider,
} from "@/lib/v1/providers/index.server";

const providerId = z.enum(["openai", "gemini", "xai"]);

const updateSchema = z.object({
  id: providerId,
  apiKey: z.string().max(512).optional(),
  model: z.string().max(120).regex(/^[A-Za-z0-9._:/-]*$/).optional(),
  enabled: z.boolean().optional(),
  admin: z.boolean().optional(),
  action: z.enum(["save", "test"]).default("save"),
});

export const Route = createFileRoute("/api/v1/providers")({
  server: {
    handlers: {
      GET: () => json(listProviders()),
      POST: async ({ request }) => {
        const body = await readJsonBody(request);
        if (!body.ok) return body.response;
        const parsed = updateSchema.safeParse(body.value);
        if (!parsed.success)
          return apiError("invalid_request", "Invalid provider settings.", 400);
        try {
          const { id, action, ...update } = parsed.data;
          if (action === "test") return json(await testProvider(id));
          updateProvider(id, update);
          return json(listProviders());
        } catch (error) {
          return errorToResponse(error);
        }
      },
      DELETE: ({ request }) => {
        const parsed = providerId.safeParse(
          new URL(request.url).searchParams.get("id"),
        );
        if (!parsed.success)
          return apiError("invalid_request", "Unknown provider.", 400);
        removeProvider(parsed.data);
        return json(listProviders());
      },
    },
  },
});
