/**
 * V1 Core / bounded agent loop.
 *
 * Flow:
 *   model → optional tool call → validate + permission check → execute
 *   → tool result → model again → … → final assistant answer
 *
 * Safety invariants:
 *  - a hard step limit (default 8 tool iterations) makes an infinite loop impossible,
 *  - every tool call goes through the registry (schema validation, permission
 *    assertion, approval gating) — the loop never calls `execute` directly,
 *  - tools the permission system denies are never advertised to the model,
 *  - tool failures are reported to the model as structured, sanitised text;
 *    internal errors, stack traces and configuration never leak.
 */
import {
  ModelEngineError,
  type EngineMessage,
  type EngineToolCall,
  type ModelEngine,
} from "../model-engine/engine";
import { PermissionDeniedError, type AiRole } from "../security/permissions";
import { ToolError, type ToolRegistry } from "../tools/registry";
import type { AgentStep } from "../types";

/** Default hard limit on tool iterations for one user request. */
export const DEFAULT_MAX_AGENT_STEPS = 8;

const MAX_RESULT_CHARS = 4_000;

export type AgentStopReason =
  | "final_answer"
  | "step_limit"
  | "no_tool_support";

export type AgentLoopOptions = {
  /** Hard tool-iteration limit for this turn. Clamped to 1…16. */
  maxSteps?: number;
  /** Tool ids the user explicitly approved for this turn. */
  approvedToolIds?: readonly string[];
  temperature?: number;
};

export type AgentLoopRequest = {
  system: string;
  messages: EngineMessage[];
  conversationId: string;
  /** Role of the AI answering this turn. Defaults to least-privileged "helper". */
  aiRole?: AiRole;
  /** Active Builder project for workspace file tools. */
  projectId?: string;
};

export type AgentLoopResult = {
  text: string;
  steps: AgentStep[];
  stoppedReason: AgentStopReason;
  iterations: number;
};

export type AgentLoopDeps = {
  engine: ModelEngine;
  registry: ToolRegistry;
};

const STEP_LIMIT_MESSAGE =
  "I stopped after reaching my safety limit for tool steps in a single request. Here is where I got to — tell me how you want to continue and I'll pick it up from there.";

function clampSteps(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return DEFAULT_MAX_AGENT_STEPS;
  return Math.min(16, Math.max(1, Math.floor(value)));
}

function truncate(value: string): string {
  return value.length > MAX_RESULT_CHARS
    ? `${value.slice(0, MAX_RESULT_CHARS)}\n…(truncated)`
    : value;
}

/** Tool arguments are only accepted as a plain JSON object. */
function normalizeArguments(
  raw: unknown,
): { ok: true; input: Record<string, unknown> } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, input: {} };
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, input: {} };
    try {
      return normalizeArguments(JSON.parse(trimmed) as unknown);
    } catch {
      return { ok: false };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, input: raw as Record<string, unknown> };
  }
  return { ok: false };
}

/** User-safe explanation for a failed tool call. */
function describeToolFailure(error: unknown): string {
  if (error instanceof ToolError) {
    switch (error.code) {
      case "not_found":
        return "That skill does not exist. Use only the skills provided to you.";
      case "invalid_input":
        return "The arguments did not match the skill's schema. Fix them and try again.";
      case "not_approved":
        return "This skill needs explicit user approval before it can run. Ask the user for approval instead of retrying.";
      default:
        return "This skill is not allowed to run.";
    }
  }
  if (error instanceof PermissionDeniedError) {
    return "Permission denied for this skill. Do not retry it; explain the limitation instead.";
  }
  return "The skill failed to run. Do not retry it more than once.";
}

export async function runAgentLoop(
  request: AgentLoopRequest,
  deps: AgentLoopDeps,
  options: AgentLoopOptions = {},
): Promise<AgentLoopResult> {
  const { engine, registry } = deps;
  const maxSteps = clampSteps(options.maxSteps);
  const approved = new Set(options.approvedToolIds ?? []);
  const steps: AgentStep[] = [];
  const messages: EngineMessage[] = [...request.messages];

  const tools = engine.supportsTools ? registry.listForModel(request.aiRole ?? "helper") : [];
  let lastText = "";
  let iterations = 0;

  while (iterations < maxSteps) {
    const result = await engine.generate({
      system: request.system,
      messages,
      ...(options.temperature === undefined
        ? {}
        : { temperature: options.temperature }),
      ...(tools.length ? { tools } : {}),
    });

    if (result.text) lastText = result.text;

    const calls = result.toolCalls ?? [];
    if (calls.length === 0) {
      return {
        text: result.text || lastText,
        steps,
        stoppedReason: tools.length ? "final_answer" : "no_tool_support",
        iterations,
      };
    }

    iterations += 1;
    messages.push({
      role: "assistant",
      content: result.text,
      toolCalls: calls,
    });

    for (const call of calls) {
      const step = await executeToolCall(call, {
        registry,
        conversationId: request.conversationId,
        aiRole: request.aiRole ?? "helper",
        ...(request.projectId ? { projectId: request.projectId } : {}),
        approved,
        index: steps.length + 1,
      });
      steps.push(step.step);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        name: call.name,
        content: step.toolMessage,
      });
    }
  }

  // Safety limit reached: stop calling tools and ask the model for a wrap-up.
  let finalText = lastText;
  try {
    const closing = await engine.generate({
      system: `${request.system}\n\nYou have reached the tool-step limit for this request. Summarise what you found and what remains, in plain language. Do not request another tool call.`,
      messages,
      ...(options.temperature === undefined
        ? {}
        : { temperature: options.temperature }),
    });
    if (closing.text) finalText = closing.text;
  } catch (error) {
    if (!(error instanceof ModelEngineError)) throw error;
  }

  return {
    text: finalText ? `${finalText}\n\n${STEP_LIMIT_MESSAGE}` : STEP_LIMIT_MESSAGE,
    steps,
    stoppedReason: "step_limit",
    iterations,
  };
}

async function executeToolCall(
  call: EngineToolCall,
  context: {
    registry: ToolRegistry;
    conversationId: string;
    aiRole: AiRole;
    projectId?: string;
    approved: Set<string>;
    index: number;
  },
): Promise<{ step: AgentStep; toolMessage: string }> {
  const startedAt = new Date().toISOString();
  const base = {
    id: `step-${context.index}`,
    toolId: call.name,
    startedAt,
  };

  const tool = context.registry.get(call.name);
  if (!tool || !context.registry.isAllowed(tool) || tool.hiddenFromModel) {
    const error = "Unknown or unavailable skill.";
    return {
      step: {
        ...base,
        input: {},
        status: "refused",
        error,
        finishedAt: new Date().toISOString(),
      },
      toolMessage: `error: ${error} Use only the skills provided to you.`,
    };
  }

  const args = normalizeArguments(call.arguments);
  if (!args.ok) {
    const error = "Arguments were not a valid JSON object.";
    return {
      step: {
        ...base,
        input: {},
        status: "failed",
        error,
        finishedAt: new Date().toISOString(),
      },
      toolMessage: `error: ${error} Send arguments matching the schema.`,
    };
  }

  if (tool.requiresApproval && !context.approved.has(tool.id)) {
    const error = "This skill requires explicit user approval.";
    return {
      step: {
        ...base,
        input: args.input,
        status: "refused",
        error,
        finishedAt: new Date().toISOString(),
      },
      toolMessage: `error: ${error} Ask the user to approve it in settings.`,
    };
  }

  try {
    const result = await context.registry.run(
      tool.id,
      args.input,
      {
        conversationId: context.conversationId,
        aiRole: context.aiRole,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      },
      { approved: context.approved.has(tool.id) },
    );
    const summary = truncate(result);
    return {
      step: {
        ...base,
        input: args.input,
        status: "completed",
        result: summary,
        finishedAt: new Date().toISOString(),
      },
      toolMessage: summary,
    };
  } catch (error) {
    const message = describeToolFailure(error);
    return {
      step: {
        ...base,
        input: args.input,
        status: "failed",
        error: message,
        finishedAt: new Date().toISOString(),
      },
      toolMessage: `error: ${message}`,
    };
  }
}
