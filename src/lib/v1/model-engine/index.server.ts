/**
 * Engine selection. Configured entirely by environment variables:
 *
 *   V1_MODEL_PROVIDER = cloud | local     (default: cloud when a key exists)
 *   V1_MODEL          = model id for the selected provider
 *
 * Add a new provider by implementing ModelEngine and adding a case here.
 */
import type { ModelEngine } from "./engine";
import { createCloudEngine } from "./lovable.server";
import { createLocalEngine } from "./local.server";
import { getAdminProviderEngine } from "../providers/index.server";

export const DEFAULT_CLOUD_MODEL = "google/gemini-3.7-flash";

export function getModelEngine(): ModelEngine {
  // The Admin AI chosen in Settings → AI Providers takes precedence.
  const selected = getAdminProviderEngine();
  if (selected) return selected;

  const configured = (process.env["V1_MODEL_PROVIDER"] ?? "").toLowerCase();
  const model = process.env["V1_MODEL"] ?? DEFAULT_CLOUD_MODEL;

  switch (configured) {
    case "local":
      return createLocalEngine();
    case "cloud": {
      const cloud = createCloudEngine(model);
      return cloud.isConfigured() ? cloud : createLocalEngine();
    }
    default: {
      const cloud = createCloudEngine(model);
      return cloud.isConfigured() ? cloud : createLocalEngine();
    }
  }
}

export type { ModelEngine };
