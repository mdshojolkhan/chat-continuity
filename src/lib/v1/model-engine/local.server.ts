/**
 * Local engine — keeps V1 useful when no cloud model is configured.
 *
 * It is deterministic, has no network access, and never evaluates user input.
 * Replace or extend it when a local/on-device model becomes available.
 */
import type {
  ModelEngine,
  ModelEngineRequest,
  ModelEngineResult,
} from "./engine";

export function createLocalEngine(): ModelEngine {
  return {
    provider: "V1 Agent Local",
    model: "v1-local-rules",
    isConfigured() {
      return true;
    },
    async generate(request: ModelEngineRequest): Promise<ModelEngineResult> {
      const last = [...request.messages]
        .reverse()
        .find((message) => message.role === "user");
      const message = (last?.content ?? "").trim();
      const normalized = message.toLowerCase();

      if (normalized.includes("permission") || normalized.includes("phone")) {
        return {
          text: "I can help plan phone features, but device capabilities must go through approved permissions and APIs. I will always ask before using anything sensitive.",
        };
      }
      if (/^(hi|hello|hey)\b/.test(normalized)) {
        return {
          text: "Hello. I'm here and ready to help you think, plan, and get things done.",
        };
      }
      return {
        text: `I'm ready to help with "${message}". Configure a model provider on the server (see README, "Model providers") to unlock richer answers.`,
      };
    },
  };
}
