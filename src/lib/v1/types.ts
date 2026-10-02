/**
 * V1 Core — shared contracts.
 *
 * This module is client-safe: it contains only types and validation schemas.
 * Never import provider adapters or secrets from here.
 */
import { z } from "zod";

export const chatRoleSchema = z.enum(["user", "assistant", "system"]);
export type ChatRole = z.infer<typeof chatRoleSchema>;

export const chatMessageSchema = z.object({
  role: chatRoleSchema,
  content: z.string().min(1).max(20_000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** Assistant personalities exposed by the existing UI. */
export const assistantModeSchema = z.enum([
  "companion",
  "programming",
  "developer",
]);
export type AssistantMode = z.infer<typeof assistantModeSchema>;

/** POST /api/chat request body. */
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  /** Short-term conversation memory supplied by the client. */
  history: z.array(chatMessageSchema).max(50).optional(),
  /** Long-term memory notes the user has explicitly saved. */
  memory: z.array(z.string().min(1).max(1_000)).max(50).optional(),
  mode: assistantModeSchema.optional(),
  /** Stable id so the orchestrator can group a conversation. */
  conversationId: z.string().min(1).max(120).optional(),
  /**
   * Skills the user explicitly approved for this turn. Approval-gated skills
   * are refused unless their id appears here.
   */
  approvedToolIds: z.array(z.string().min(1).max(80)).max(20).optional(),
  /**
   * Optional provider to answer this turn. A non-admin provider always runs
   * as a Helper AI; the role is decided on the server, never by the client.
   */
  providerId: z.enum(["openai", "gemini", "xai"]).optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ToolTrace = {
  toolId: string;
  input: unknown;
  ok: boolean;
  summary: string;
};

// ---------------------------------------------------------------------------
// Task planning
// ---------------------------------------------------------------------------

export const planStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
]);
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;

/** One step in a conversation's task plan. */
export type PlanStep = {
  id: string;
  title: string;
  status: PlanStepStatus;
  /** Optional progress/result note written when the step is updated. */
  note?: string;
};

// ---------------------------------------------------------------------------
// Agent step / action trace
// ---------------------------------------------------------------------------

export const agentStepStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "refused",
]);
export type AgentStepStatus = z.infer<typeof agentStepStatusSchema>;

/**
 * One auditable action in the agent loop (model → tool call → result).
 * Every action the orchestrator takes is recorded as an AgentStep so the
 * client can render exactly what happened and why.
 */
export type AgentStep = {
  /** Stable id within the turn, e.g. "step-1". */
  id: string;
  /** Tool/skill that was invoked, or "model" for a model-only step. */
  toolId: string;
  /** Arguments passed to the tool. */
  input: Record<string, unknown>;
  status: AgentStepStatus;
  /** Tool result summary when the step completed. */
  result?: string;
  /** Error message when the step failed or was refused. */
  error?: string;
  /** ISO timestamps for the action lifecycle. */
  startedAt: string;
  finishedAt?: string;
};

/** POST /api/chat success response. */
export type ChatResponse = {
  message: string;
  provider: string;
  model: string;
  intent: Intent;
  conversationId: string;
  toolsUsed: ToolTrace[];
  /** Role the answering AI ran under (server-decided). */
  aiRole?: "admin" | "helper";
  /** Task plan for this conversation, when one exists. */
  plan?: PlanStep[];
  /** Ordered action trace for this turn, when any actions ran. */
  steps?: AgentStep[];
};

export type ApiError = {
  error: string;
  code:
    | "invalid_request"
    | "model_unavailable"
    | "rate_limited"
    | "payment_required"
    | "forbidden"
    | "internal_error";
  details?: unknown;
};

export const intentSchema = z.enum([
  "smalltalk",
  "question",
  "task",
  "tool",
  "unsafe",
]);
export type Intent = z.infer<typeof intentSchema>;

/** Tool metadata that is safe to send to the browser. */
export type PublicTool = {
  id: string;
  name: string;
  description: string;
  requiresApproval: boolean;
  permissions: string[];
};

export const toolExecutionRequestSchema = z.object({
  toolId: z.string().min(1).max(80),
  input: z.record(z.unknown()).optional(),
  approved: z.boolean().optional(),
});
export type ToolExecutionRequest = z.infer<typeof toolExecutionRequestSchema>;

export type ToolExecutionResponse = {
  toolId: string;
  executed: boolean;
  result: string;
};

export type AssistantStatus = {
  status: "ready" | "degraded";
  provider: string;
  model: string;
  message: string;
  tools: number;
};

/** Workspace file metadata that is safe to send to the browser. */
export type WorkspaceFileSummary = {
  path: string;
  bytes: number;
  updatedAt: string;
};

export const workspaceDeleteRequestSchema = z.object({
  path: z.string().min(1).max(300),
});
export type WorkspaceDeleteRequest = z.infer<
  typeof workspaceDeleteRequestSchema
>;
