/**
 * Built-in V1 skills (Phase 1).
 *
 * Every skill here is registered with:
 *  - a strict Zod input schema (validated by the registry before execution),
 *  - the minimum permission it needs (asserted by the registry at run time),
 *  - an approval flag for anything destructive.
 *
 * Hard boundaries preserved: no device control, no system execution, no
 * arbitrary URL fetching. File access is limited to the sandboxed workspace
 * and the only outbound call is the read-only web search.
 */
import { z } from "zod";
import { longTermMemory } from "../memory/index.server";
import { planStore } from "../planning/index.server";
import { webSearch } from "../search/index.server";
import { workspaceFor } from "../files/index.server";
import { planStepStatusSchema } from "../types";
import { ToolRegistry, type V1Tool } from "./registry";

/** Long-term memory owner for this single-user phase. */
const MEMORY_OWNER = "local-user";

const currentTime: V1Tool<z.ZodObject<{ timeZone: z.ZodOptional<z.ZodString> }>> =
  {
    id: "current_time",
    name: "Current time",
    description: "Reads the server time. Changes nothing.",
    requiresApproval: false,
    permissions: ["read:time"],
    inputSchema: z.object({ timeZone: z.string().max(60).optional() }),
    execute(input) {
      const now = new Date();
      if (!input.timeZone) return `Current time (UTC): ${now.toISOString()}`;
      try {
        return `Current time (${input.timeZone}): ${now.toLocaleString("en-GB", {
          timeZone: input.timeZone,
        })}`;
      } catch {
        return `Current time (UTC): ${now.toISOString()}`;
      }
    },
  };

const analyzeText: V1Tool<z.ZodObject<{ text: z.ZodString }>> = {
  id: "analyze_text",
  name: "Text analyzer",
  description: "Summarises the shape of text you supply (counts, structure).",
  requiresApproval: true,
  permissions: ["read:conversation"],
  inputSchema: z.object({ text: z.string().min(1).max(8_000) }),
  execute(input) {
    const words = input.text.trim().split(/\s+/).filter(Boolean);
    const sentences = input.text
      .split(/[.!?]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const longest = [...words].sort((a, b) => b.length - a.length)[0] ?? "";
    return [
      `Characters: ${input.text.length}`,
      `Words: ${words.length}`,
      `Sentences: ${sentences.length}`,
      `Longest word: ${longest}`,
    ].join("\n");
  },
};

const permissionPlanner: V1Tool<
  z.ZodObject<{ capability: z.ZodOptional<z.ZodString> }>
> = {
  id: "draft_android_permission_plan",
  name: "Android permission planner",
  description:
    "Drafts a permission-aware plan for a future device capability. Plans only — it cannot control a device.",
  requiresApproval: true,
  permissions: ["read:conversation"],
  inputSchema: z.object({ capability: z.string().max(200).optional() }),
  execute(input) {
    const capability = input.capability?.trim() || "the requested capability";
    return [
      `Plan for ${capability}:`,
      "1. Identify the exact platform API required.",
      "2. Declare the minimum permission that covers it.",
      "3. Request the permission at runtime, with a plain-language reason.",
      "4. Handle denial gracefully and keep a non-permission fallback.",
      "5. Log the action for review; never run it silently in the background.",
    ].join("\n");
  },
};

// ---------------------------------------------------------------------------
// Web search (read-only, no arbitrary URLs)
// ---------------------------------------------------------------------------

const webSearchTool: V1Tool<
  z.ZodObject<{ query: z.ZodString; limit: z.ZodOptional<z.ZodNumber> }>
> = {
  id: "web_search",
  name: "Web search",
  description:
    "Searches the public web for a query and returns titles, links and snippets. Read-only; it cannot open a URL you supply.",
  requiresApproval: false,
  permissions: ["net:search"],
  inputSchema: z.object({
    query: z.string().min(2).max(300),
    limit: z.number().int().min(1).max(8).optional(),
  }),
  async execute(input) {
    const results = await webSearch(input.query, input.limit ?? 5);
    if (results.length === 0) return "No results found for that query.";
    return results
      .map(
        (result, index) =>
          `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`,
      )
      .join("\n\n");
  },
};

// ---------------------------------------------------------------------------
// Workspace file skills (sandboxed store only)
// ---------------------------------------------------------------------------

const fileWrite: V1Tool<
  z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
    mode: z.ZodOptional<z.ZodEnum<["overwrite", "append"]>>;
  }>
> = {
  id: "file_write",
  name: "Write workspace file",
  description:
    "Creates or updates a text file inside V1's own workspace. It cannot reach your device's filesystem.",
  requiresApproval: false,
  permissions: ["fs:workspace", "fs:workspace:write"],
  inputSchema: z.object({
    path: z.string().min(1).max(200),
    content: z.string().max(64_000),
    mode: z.enum(["overwrite", "append"]).optional(),
  }),
  async execute(input, context) {
    const workspaceStore = workspaceFor(context.projectId);
    const file =
      input.mode === "append"
        ? await workspaceStore.append(input.path, input.content)
        : await workspaceStore.write(input.path, input.content);
    return `Saved ${file.path} (${file.bytes} bytes).`;
  },
};

const fileRead: V1Tool<z.ZodObject<{ path: z.ZodString }>> = {
  id: "file_read",
  name: "Read workspace file",
  description: "Reads a text file from V1's own workspace.",
  requiresApproval: false,
  permissions: ["fs:workspace"],
  inputSchema: z.object({ path: z.string().min(1).max(200) }),
  async execute(input, context) {
    const file = await workspaceFor(context.projectId).read(input.path);
    if (!file) return "That workspace file does not exist.";
    return `${file.path} (${file.bytes} bytes):\n${file.content}`;
  },
};

const fileList: V1Tool<z.ZodObject<Record<string, never>>> = {
  id: "file_list",
  name: "List workspace files",
  description: "Lists the files in V1's own workspace with their sizes.",
  requiresApproval: false,
  permissions: ["fs:workspace"],
  inputSchema: z.object({}),
  async execute(_input, context) {
    const files = await workspaceFor(context.projectId).list();
    if (files.length === 0) return "The workspace is empty.";
    return files
      .map((file) => `${file.path} — ${file.bytes} bytes, updated ${file.updatedAt}`)
      .join("\n");
  },
};

const fileDelete: V1Tool<z.ZodObject<{ path: z.ZodString }>> = {
  id: "file_delete",
  name: "Delete workspace file",
  description:
    "Deletes a file from V1's own workspace. Destructive, so it needs explicit approval.",
  requiresApproval: true,
  permissions: ["fs:workspace", "fs:workspace:write"],
  inputSchema: z.object({ path: z.string().min(1).max(200) }),
  async execute(input, context) {
    const removed = await workspaceFor(context.projectId).remove(input.path);
    return removed
      ? `Deleted ${input.path}.`
      : "That workspace file does not exist.";
  },
};

// ---------------------------------------------------------------------------
// Memory skills (existing long-term memory store)
// ---------------------------------------------------------------------------

const memoryRemember: V1Tool<z.ZodObject<{ text: z.ZodString }>> = {
  id: "memory_remember",
  name: "Remember a fact",
  description: "Saves a short fact about the user to long-term memory.",
  requiresApproval: false,
  permissions: ["write:memory"],
  inputSchema: z.object({ text: z.string().min(1).max(1_000) }),
  async execute(input) {
    const record = await longTermMemory.remember(MEMORY_OWNER, input.text);
    return `Remembered (id ${record.id}): ${record.text}`;
  },
};

const memoryList: V1Tool<z.ZodObject<Record<string, never>>> = {
  id: "memory_list",
  name: "List memories",
  description: "Lists the facts saved in long-term memory.",
  requiresApproval: false,
  permissions: ["write:memory"],
  inputSchema: z.object({}),
  async execute() {
    const records = await longTermMemory.list(MEMORY_OWNER);
    if (records.length === 0) return "Nothing is saved in long-term memory.";
    return records
      .map((record) => `${record.id}: ${record.text}`)
      .join("\n");
  },
};

const memoryForget: V1Tool<z.ZodObject<{ id: z.ZodString }>> = {
  id: "memory_forget",
  name: "Forget a memory",
  description:
    "Deletes one saved fact by id. Destructive, so it needs explicit approval.",
  requiresApproval: true,
  permissions: ["write:memory"],
  inputSchema: z.object({ id: z.string().min(1).max(120) }),
  async execute(input) {
    await longTermMemory.forget(MEMORY_OWNER, input.id);
    return `Forgot memory ${input.id} if it existed.`;
  },
};

// ---------------------------------------------------------------------------
// Planning skills (existing plan store)
// ---------------------------------------------------------------------------

const createPlan: V1Tool<z.ZodObject<{ steps: z.ZodArray<z.ZodString> }>> = {
  id: "create_plan",
  name: "Create task plan",
  description:
    "Creates an ordered plan for this conversation so a multi-step task stays visible.",
  requiresApproval: false,
  permissions: ["write:plan"],
  inputSchema: z.object({
    steps: z.array(z.string().min(1).max(200)).min(1).max(12),
  }),
  execute(input, context) {
    const steps = planStore.set(context.conversationId, input.steps);
    return steps.map((step) => `${step.id}: ${step.title} [${step.status}]`).join("\n");
  },
};

const updatePlanStep: V1Tool<
  z.ZodObject<{
    stepId: z.ZodString;
    status: typeof planStepStatusSchema;
    note: z.ZodOptional<z.ZodString>;
  }>
> = {
  id: "update_plan_step",
  name: "Update plan step",
  description:
    "Updates the status of one plan step (pending, running, completed, failed, skipped).",
  requiresApproval: false,
  permissions: ["write:plan"],
  inputSchema: z.object({
    stepId: z.string().min(1).max(40),
    status: planStepStatusSchema,
    note: z.string().max(400).optional(),
  }),
  execute(input, context) {
    const steps = planStore.update(
      context.conversationId,
      input.stepId,
      input.status,
      input.note,
    );
    if (steps.length === 0) return "There is no plan for this conversation yet.";
    return steps.map((step) => `${step.id}: ${step.title} [${step.status}]`).join("\n");
  },
};

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  for (const tool of [
    currentTime,
    analyzeText,
    permissionPlanner,
    webSearchTool,
    fileWrite,
    fileRead,
    fileList,
    fileDelete,
    memoryRemember,
    memoryList,
    memoryForget,
    createPlan,
    updatePlanStep,
  ] as V1Tool[]) {
    registry.register(tool);
  }
  return registry;
}

/** Shared registry instance for the server runtime. */
export const toolRegistry = createToolRegistry();
