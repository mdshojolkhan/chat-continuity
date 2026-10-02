/**
 * ModelEngine — the provider-independent inference boundary of V1.
 *
 * Nothing outside `src/lib/v1/model-engine` may know which vendor answers a
 * request. To add a cloud model, a local model, or a future custom V1 model,
 * implement this interface and register it in `index.server.ts`.
 */
import type { ChatMessage } from "../types";

/** A tool call the model asked V1 to run. */
export type EngineToolCall = {
  id: string;
  name: string;
  /** Raw JSON arguments produced by the model. Always validated before use. */
  arguments: unknown;
};

/**
 * Messages exchanged with the engine. This is a superset of the client-facing
 * `ChatMessage` so a tool result can be fed back into the loop.
 */
export type EngineMessage =
  | ChatMessage
  | {
      role: "assistant";
      content: string;
      toolCalls: EngineToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      name: string;
      content: string;
    };

/** Tool description handed to the model (JSON Schema parameters). */
export type EngineTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ModelEngineRequest = {
  /** Instructions describing how V1 should behave for this turn. */
  system: string;
  /** Conversation window (short-term memory) plus the new user message. */
  messages: EngineMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Tools the model may call. Omitted when tool calling is not wanted. */
  tools?: EngineTool[];
};

export type ModelEngineResult = {
  text: string;
  toolCalls?: EngineToolCall[];
};

export type ModelEngineErrorCode =
  | "unavailable"
  | "rate_limited"
  | "payment_required"
  | "forbidden"
  | "invalid_request";

export class ModelEngineError extends Error {
  readonly code: ModelEngineErrorCode;

  constructor(code: ModelEngineErrorCode, message: string) {
    super(message);
    this.name = "ModelEngineError";
    this.code = code;
  }
}

export type ModelEngine = {
  /** Human readable provider name, safe to show in the UI. */
  readonly provider: string;
  /** Model identifier, safe to show in the UI (never a credential). */
  readonly model: string;
  /** True when the engine has everything it needs to answer. */
  isConfigured(): boolean;
  /** True when the engine can execute tool calls. */
  readonly supportsTools?: boolean;
  generate(request: ModelEngineRequest): Promise<ModelEngineResult>;
};
