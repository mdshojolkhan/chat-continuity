/**
 * Provider service: resolves credentials server-side, exposes safe public
 * views, tests connections and builds ModelEngines for the existing
 * model-engine boundary.
 */
import type { ModelEngine } from "../model-engine/engine";
import { createOpenAiCompatibleEngine } from "../model-engine/openai-compatible.server";
import {
  PROVIDERS,
  getProviderDefinition,
  type ProviderDefinition,
  type ProviderId,
  type PublicProvider,
} from "./registry";
import { providerStore, type ProviderConfig } from "./store.server";

function defaultConfig(id: ProviderId): ProviderConfig {
  return {
    id,
    apiKey: null,
    model: null,
    enabled: false,
    status: "untested",
    statusMessage: null,
    testedAt: null,
  };
}

function configFor(id: ProviderId): ProviderConfig {
  return providerStore.get(id) ?? defaultConfig(id);
}

function resolveKey(def: ProviderDefinition): {
  key: string | null;
  source: PublicProvider["keySource"];
} {
  const stored = providerStore.get(def.id)?.apiKey;
  if (stored) return { key: stored, source: "settings" };
  const env = process.env[def.keyEnv];
  if (env) return { key: env, source: "secret" };
  return { key: null, source: null };
}

export function toPublicProvider(def: ProviderDefinition): PublicProvider {
  const config = configFor(def.id);
  const { key, source } = resolveKey(def);
  return {
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    keyUrl: def.keyUrl,
    models: def.models,
    model: config.model ?? def.defaultModel,
    enabled: config.enabled,
    role:
      providerStore.getAdmin() === def.id
        ? "admin"
        : config.enabled
          ? "helper"
          : null,
    configured: Boolean(key),
    keySource: source,
    keyHint: key ? key.slice(-4) : null,
    status: config.status,
    statusMessage: config.statusMessage,
    testedAt: config.testedAt,
  };
}

export function listProviders(): PublicProvider[] {
  return PROVIDERS.map(toPublicProvider);
}

export type ProviderUpdate = {
  apiKey?: string | undefined;
  model?: string | undefined;
  enabled?: boolean | undefined;
  /** true = make this provider the Admin AI (previous admin becomes a helper). */
  admin?: boolean | undefined;
};

export function updateProvider(id: ProviderId, update: ProviderUpdate) {
  const current = configFor(id);
  const next: ProviderConfig = { ...current };
  if (update.apiKey !== undefined) {
    next.apiKey = update.apiKey.trim() || null;
    next.status = "untested";
    next.statusMessage = null;
    next.testedAt = null;
  }
  if (update.model !== undefined) next.model = update.model.trim() || null;
  if (update.enabled !== undefined) next.enabled = update.enabled;
  if (update.admin === true) {
    const def = getProviderDefinition(id)!;
    if (!next.enabled) throw new ProviderRoleError("Enable the provider before making it the Admin AI.");
    if (!next.apiKey && !process.env[def.keyEnv])
      throw new ProviderRoleError("Add an API key before making this provider the Admin AI.");
  }
  providerStore.set(next);
  if (update.admin === true) providerStore.setAdmin(id);
  if (update.admin === false && providerStore.getAdmin() === id)
    providerStore.setAdmin(null);
  if (!next.enabled && providerStore.getAdmin() === id)
    providerStore.setAdmin(null);
}

export class ProviderRoleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRoleError";
  }
}

export function getAdminProviderId(): ProviderId | null {
  return providerStore.getAdmin();
}

export function removeProvider(id: ProviderId) {
  providerStore.remove(id);
}

export async function testProvider(id: ProviderId): Promise<PublicProvider> {
  const def = getProviderDefinition(id)!;
  const { key } = resolveKey(def);
  const config = configFor(id);
  let status: ProviderConfig["status"] = "failed";
  let message: string;
  if (!key) {
    message = "No API key configured.";
  } else {
    try {
      const res = await fetch(def.modelsUrl, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        status = "connected";
        message = "Connection OK.";
      } else if (res.status === 401 || res.status === 403) {
        message = "The API key was rejected.";
      } else if (res.status === 429) {
        message = "Rate limited — the key works but try again later.";
      } else {
        message = `Provider responded with status ${res.status}.`;
      }
    } catch {
      message = "Could not reach the provider.";
    }
  }
  providerStore.set({
    ...config,
    status,
    statusMessage: message,
    testedAt: new Date().toISOString(),
  });
  return toPublicProvider(def);
}

/** Engine for the Admin AI, or null when none is usable. */
export function getAdminProviderEngine(): ModelEngine | null {
  const id = providerStore.getAdmin();
  if (!id) return null;
  return createProviderEngine(id);
}

/**
 * Picks the engine and role for a chat turn. The role is decided here on the
 * server, never by the client:
 *  - a specific non-admin provider → "helper"
 *  - the Admin AI → "admin"
 *  - no Admin AI selected → the built-in V1 engine runs as "admin" so the
 *    App Builder keeps working out of the box.
 */
export function resolveChatEngine(
  providerId: ProviderId | undefined,
  fallback: () => ModelEngine,
): { engine: ModelEngine; role: "admin" | "helper"; providerId: ProviderId | null } {
  const adminId = providerStore.getAdmin();
  if (providerId && providerId !== adminId) {
    const engine = createProviderEngine(providerId);
    if (!engine) throw new ProviderRoleError("That helper AI is not enabled or configured.");
    return { engine, role: "helper", providerId };
  }
  const admin = getAdminProviderEngine();
  if (admin) return { engine: admin, role: "admin", providerId: adminId };
  return { engine: fallback(), role: "admin", providerId: null };
}

export function createProviderEngine(id: ProviderId): ModelEngine | null {
  const def = getProviderDefinition(id);
  if (!def) return null;
  const config = configFor(id);
  if (!config.enabled) return null;
  const engine = createOpenAiCompatibleEngine({
    provider: def.displayName,
    model: config.model ?? def.defaultModel,
    url: def.chatUrl,
    apiKeyEnv: def.keyEnv,
    getApiKey: () => resolveKey(def).key ?? undefined,
  });
  return engine.isConfigured() ? engine : null;
}
