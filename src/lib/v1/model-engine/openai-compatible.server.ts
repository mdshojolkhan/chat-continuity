/**
 * Generic OpenAI-compatible chat engine.
 *
 * Every cloud provider V1 talks to (Lovable AI Gateway, OpenAI, Google Gemini's
 * OpenAI-compatible endpoint, xAI Grok) speaks the same wire format, so they all
 * share this implementation. Credentials are read inside the request path and
 * never leave the server.
 */
import {
  ModelEngineError,
  type EngineMessage,
  type EngineToolCall,
  type ModelEngine,
  type ModelEngineRequest,
  type ModelEngineResult,
} from "./engine";

type WireMessage = Record<string, unknown>;

export function toWire(message: EngineMessage): WireMessage {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }
  if ("toolCalls" in message && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {}),
        },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

export function parseToolCalls(raw: unknown): EngineToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const call = entry as {
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const name = call.function?.name;
    if (!name) return [];
    let args: unknown = {};
    try {
      args = call.function?.arguments
        ? JSON.parse(call.function.arguments)
        : {};
    } catch {
      args = {};
    }
    return [{ id: call.id ?? crypto.randomUUID(), name, arguments: args }];
  });
}

export type OpenAiCompatibleConfig = {
  /** Display name, safe for the UI. */
  provider: string;
  model: string;
  url: string;
  /** Environment variable holding the credential. */
  apiKeyEnv: string;
  /** Header used to send the credential. Defaults to `Authorization: Bearer`. */
  authHeader?: string;
  supportsTools?: boolean;
  /** Optional server-side key resolver (e.g. provider settings store). */
  getApiKey?: () => string | undefined;
};

export function createOpenAiCompatibleEngine(
  config: OpenAiCompatibleConfig,
): ModelEngine {
  const readKey = () =>
    config.getApiKey ? config.getApiKey() : process.env[config.apiKeyEnv];

  return {
    provider: config.provider,
    model: config.model,
    supportsTools: config.supportsTools ?? true,
    isConfigured() {
      return Boolean(readKey());
    },
    async generate(request: ModelEngineRequest): Promise<ModelEngineResult> {
      const apiKey = readKey();
      if (!apiKey) {
        throw new ModelEngineError(
          "unavailable",
          `${config.provider} is not configured on this server. Add its API key in project settings.`,
        );
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.authHeader) headers[config.authHeader] = apiKey;
      else headers["Authorization"] = `Bearer ${apiKey}`;

      let response: Response;
      try {
        response = await fetch(config.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: request.system },
              ...request.messages.map(toWire),
            ],
            ...(request.temperature !== undefined
              ? { temperature: request.temperature }
              : {}),
            ...(request.maxOutputTokens
              ? { max_tokens: request.maxOutputTokens }
              : {}),
            ...(request.tools?.length
              ? {
                  tools: request.tools.map((tool) => ({
                    type: "function",
                    function: {
                      name: tool.name,
                      description: tool.description,
                      parameters: tool.parameters,
                    },
                  })),
                  tool_choice: "auto",
                }
              : {}),
          }),
        });
      } catch {
        throw new ModelEngineError(
          "unavailable",
          `${config.provider} could not be reached.`,
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ModelEngineError(
          mapStatus(response.status),
          messageForStatus(config.provider, response.status, detail),
        );
      }

      const payload = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string; tool_calls?: unknown };
        }>;
      };
      const choice = payload.choices?.[0]?.message;
      const toolCalls = parseToolCalls(choice?.tool_calls);
      const text = choice?.content?.trim() ?? "";

      if (!text && toolCalls.length === 0) {
        throw new ModelEngineError(
          "unavailable",
          `${config.provider} returned an empty response.`,
        );
      }
      return toolCalls.length > 0 ? { text, toolCalls } : { text };
    },
  };
}

function mapStatus(status: number) {
  if (status === 429) return "rate_limited" as const;
  if (status === 402) return "payment_required" as const;
  if (status === 401 || status === 403) return "forbidden" as const;
  if (status === 400) return "invalid_request" as const;
  return "unavailable" as const;
}

function messageForStatus(provider: string, status: number, detail: string) {
  switch (status) {
    case 429:
      return `${provider} is rate limiting V1 right now. Try again in a moment.`;
    case 402:
      return `${provider} credits are exhausted. Add credits to keep V1 thinking.`;
    case 401:
    case 403:
      return `${provider} rejected the configured API key.`;
    case 400:
      return `${provider} rejected the request: ${detail.slice(0, 300)}`;
    default:
      return `${provider} is temporarily unavailable.`;
  }
}
