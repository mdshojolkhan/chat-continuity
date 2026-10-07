/**
 * Skill/tool registry.
 *
 * Every tool declares: id, name, description, permissions, an input schema and
 * an execute function. Input is always validated with the schema before the
 * tool runs, so a user message can never reach a tool unchecked.
 */
import type { z } from "zod";
import type { PublicTool } from "../types";
import {
  assertRolePermissions,
  isAllowedForRole,
  isPermissionGranted,
  type AiRole,
  type Permission,
} from "../security/permissions";
import type { EngineTool } from "../model-engine/engine";
import {
  toParametersSchema,
  type JsonSchemaObject,
} from "./json-schema";

export type ToolContext = {
  /** Conversation the tool was invoked from. */
  conversationId: string;
  /**
   * Role of the actor. Defaults to "helper" (least privilege) when omitted,
   * so workspace writes always require an explicit admin/user context.
   */
  aiRole?: AiRole;
  /** Active Builder project; file tools only touch this project's files. */
  projectId?: string;
};

export type V1Tool<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  id: string;
  name: string;
  description: string;
  /** Human approval required before the tool may run. */
  requiresApproval: boolean;
  permissions: Permission[];
  inputSchema: Schema;
  /**
   * Optional hand-written JSON Schema for the model. When omitted it is
   * derived from `inputSchema`, so the validated shape and the advertised
   * shape can never drift apart.
   */
  parameters?: JsonSchemaObject;
  /** Hidden from the model (still runnable through the explicit tool API). */
  hiddenFromModel?: boolean;
  execute(
    input: z.infer<Schema>,
    context: ToolContext,
  ): Promise<string> | string;
};

export class ToolError extends Error {
  readonly code: "not_found" | "invalid_input" | "not_approved" | "denied";

  constructor(
    code: "not_found" | "invalid_input" | "not_approved" | "denied",
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

export class ToolRegistry {
  private readonly tools = new Map<string, V1Tool>();

  register(tool: V1Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool "${tool.id}" is already registered.`);
    }
    this.tools.set(tool.id, tool as V1Tool);
  }

  get(id: string): V1Tool | undefined {
    return this.tools.get(id);
  }

  list(): V1Tool[] {
    return [...this.tools.values()];
  }

  /** Metadata safe to send to the browser. */
  listPublic(): PublicTool[] {
    return this.list().map((tool) => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      requiresApproval: tool.requiresApproval,
      permissions: tool.permissions,
    }));
  }

  /** True when every permission a tool needs is currently granted. */
  isAllowed(tool: V1Tool): boolean {
    return tool.permissions.every((permission) =>
      isPermissionGranted(permission),
    );
  }

  /** Model-ready JSON Schema parameters for a tool. */
  parametersFor(tool: V1Tool): JsonSchemaObject {
    return tool.parameters ?? toParametersSchema(tool.inputSchema);
  }

  /** Tools the permission system currently allows. */
  listAllowed(): V1Tool[] {
    return this.list().filter((tool) => this.isAllowed(tool));
  }

  /**
   * Tool definitions the model is allowed to see and call.
   *
   * Any tool requiring a forbidden permission (device control, system exec,
   * arbitrary network fetch) is filtered out here and therefore never reaches
   * the model at all.
   */
  listForModel(role: AiRole = "helper"): EngineTool[] {
    return this.listAllowed()
      .filter((tool) => tool.hiddenFromModel !== true)
      .filter((tool) => tool.permissions.every((p) => isAllowedForRole(role, p)))
      .map((tool) => ({
        name: tool.id,
        description: tool.description,
        parameters: this.parametersFor(tool),
      }));
  }

  async run(
    id: string,
    rawInput: unknown,
    context: ToolContext,
    options: { approved?: boolean } = {},
  ): Promise<string> {
    const tool = this.get(id);
    if (!tool) throw new ToolError("not_found", "Tool is not available.");

    if (tool.requiresApproval && options.approved !== true) {
      throw new ToolError(
        "not_approved",
        "Explicit approval is required for this skill.",
      );
    }

    // Enforced on every execution path (agent loop, tool API, commands).
    assertRolePermissions(context.aiRole ?? "helper", tool.permissions);

    const parsed = tool.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new ToolError(
        "invalid_input",
        "The input for this skill is not valid.",
      );
    }

    return await tool.execute(parsed.data, context);
  }
}
