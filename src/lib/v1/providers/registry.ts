/**
 * AI provider catalogue (client-safe). No credentials live here — only the
 * public description of each provider. Add a provider by adding one entry;
 * the server side (`index.server.ts`) and the Settings UI read from this list.
 */
export type ProviderId = "openai" | "gemini" | "xai";

export type ProviderDefinition = {
  id: ProviderId;
  displayName: string;
  description: string;
  /** Default model used when the user has not picked one. */
  defaultModel: string;
  /** Suggested models shown in Settings. Any model id is accepted. */
  models: string[];
  /** Where the user creates an API key. */
  keyUrl: string;
  /** Project secret used as a fallback credential when no key was entered. */
  keyEnv: string;
  /** OpenAI-compatible chat completions endpoint. */
  chatUrl: string;
  /** Lightweight endpoint used by "Test connection". */
  modelsUrl: string;
};

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "openai",
    displayName: "OpenAI / ChatGPT",
    description: "GPT models from OpenAI.",
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1", "gpt-4.1-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    keyEnv: "OPENAI_API_KEY",
    chatUrl: "https://api.openai.com/v1/chat/completions",
    modelsUrl: "https://api.openai.com/v1/models",
  },
  {
    id: "gemini",
    displayName: "Google Gemini (AI Studio)",
    description: "Gemini models. Uses an API key from Google AI Studio.",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyEnv: "GEMINI_API_KEY",
    chatUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/openai/models",
  },
  {
    id: "xai",
    displayName: "xAI Grok",
    description: "Grok models from xAI.",
    defaultModel: "grok-3-mini",
    models: ["grok-3-mini", "grok-3", "grok-4"],
    keyUrl: "https://console.x.ai",
    keyEnv: "XAI_API_KEY",
    chatUrl: "https://api.x.ai/v1/chat/completions",
    modelsUrl: "https://api.x.ai/v1/models",
  },
];

export function getProviderDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export type ProviderConnectionStatus = "untested" | "connected" | "failed";

/** What the browser is allowed to know about a provider. Never contains a key. */
export type PublicProvider = {
  id: ProviderId;
  displayName: string;
  description: string;
  keyUrl: string;
  models: string[];
  model: string;
  enabled: boolean;
  /** "admin" for the single Admin AI, "helper" for other enabled providers. */
  role: "admin" | "helper" | null;
  configured: boolean;
  /** "settings" when entered in the UI, "secret" when from a project secret. */
  keySource: "settings" | "secret" | null;
  /** Last 4 characters only, for recognition. */
  keyHint: string | null;
  status: ProviderConnectionStatus;
  statusMessage: string | null;
  testedAt: string | null;
};
