/**
 * Server-only provider configuration store. Keys are held here and never
 * serialised to the browser. The default implementation is in-process (like the
 * workspace store); swap it for an encrypted database-backed store behind the
 * same interface for durable storage.
 */
import type { ProviderConnectionStatus, ProviderId } from "./registry";

export type ProviderConfig = {
  id: ProviderId;
  apiKey: string | null;
  model: string | null;
  enabled: boolean;
  status: ProviderConnectionStatus;
  statusMessage: string | null;
  testedAt: string | null;
};

export type ProviderStore = {
  get(id: ProviderId): ProviderConfig | undefined;
  set(config: ProviderConfig): void;
  remove(id: ProviderId): void;
  /** The single Admin AI. Holding one id makes two admins impossible. */
  getAdmin(): ProviderId | null;
  setAdmin(id: ProviderId | null): void;
};

function createMemoryProviderStore(): ProviderStore {
  const configs = new Map<ProviderId, ProviderConfig>();
  let admin: ProviderId | null = null;
  return {
    get: (id) => configs.get(id),
    set: (config) => void configs.set(config.id, config),
    remove: (id) => {
      configs.delete(id);
      if (admin === id) admin = null;
    },
    getAdmin: () => admin,
    setAdmin: (id) => {
      admin = id;
    },
  };
}

export const providerStore: ProviderStore = createMemoryProviderStore();
