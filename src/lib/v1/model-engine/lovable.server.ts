/**
 * Cloud engine backed by the Lovable AI Gateway (OpenAI-compatible).
 *
 * The API key is read inside the request path and never leaves the server.
 * Supports tool calling so the orchestrator can run a real agent loop.
 */
import {
  ModelEngineError,
  type EngineMessage,
  type EngineToolCall,
  type ModelEngine,
  type ModelEngineRequest,
  type ModelEngineResult,
} from "./engine";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type WireMessage = Record<string, unknown>;

function toWire(message: EngineMessage): WireMessage {
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

function parseToolCalls(raw: unknown): EngineToolCall[] {
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

export function createCloudEngine(model: string): ModelEngine {
  return {
    provider: "V1 Agent Cloud",
    model,
    supportsTools: true,
    isConfigured() {
      return Boolean(process.env["LOVABLE_API_KEY"]);
    },
    async generate(request: ModelEngineRequest): Promise<ModelEngineResult> {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) {
        throw new ModelEngineError(
          "unavailable",
          "The cloud model is not configured on this server.",
        );
      }

      let response: Response;
      try {
        response = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              ...request.messages.map(toWire),
            ],
            ...(request.temperature === undefined
              ? {}
              : { temperature: request.temperature }),
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
          "The thinking engine could not be reached.",
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new ModelEngineError(
          mapStatus(response.status),
          messageForStatus(response.status, detail),
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
          "The thinking engine returned an empty response.",
        );
      }
      return toolCalls.length > 0 ? { text, toolCalls } : { text };
    },
  };
}

function mapStatus(status: number) {
  if (status === 429) return "rate_limited" as const;
  if (status === 402) return "payment_required" as const;
  if (status === 403) return "forbidden" as const;
  if (status === 400) return "invalid_request" as const;
  return "unavailable" as const;
}

function messageForStatus(status: number, detail: string) {
  switch (status) {
    case 429:
      return "V1 is being rate limited right now. Try again in a moment.";
    case 402:
      return "AI credits are exhausted. Add credits to keep V1 thinking.";
    case 403:
      return "AI access is blocked for this workspace.";
    case 400:
      return `The model rejected the request: ${detail.slice(0, 300)}`;
    default:
      return "The thinking engine is temporarily unavailable.";
  }
}
