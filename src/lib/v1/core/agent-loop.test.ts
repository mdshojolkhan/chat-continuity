/**
 * Focused tests for the bounded agent loop (run with `bun test`).
 *
 * They use a scripted fake ModelEngine and a throwaway ToolRegistry so no
 * network call, no real model and no shared state is involved.
 */
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  ModelEngineError,
  type ModelEngine,
  type ModelEngineRequest,
  type ModelEngineResult,
} from "../model-engine/engine";
import { PermissionDeniedError } from "../security/permissions";
import { ToolRegistry } from "../tools/registry";
import { runAgentLoop } from "./agent-loop.server";

type ScriptedTurn = ModelEngineResult;

function fakeEngine(script: ScriptedTurn[], supportsTools = true) {
  const requests: ModelEngineRequest[] = [];
  const engine: ModelEngine = {
    provider: "test",
    model: "test-model",
    isConfigured: () => true,
    supportsTools,
    async generate(request) {
      requests.push(request);
      return script[Math.min(requests.length - 1, script.length - 1)]!;
    },
  };
  return { engine, requests };
}

function registryWithEcho() {
  const registry = new ToolRegistry();
  registry.register({
    id: "echo",
    name: "Echo",
    description: "Echo back a value.",
    requiresApproval: false,
    permissions: ["read:time"],
    inputSchema: z.object({ value: z.string().min(1) }),
    execute: (input) => `echo:${input.value}`,
  });
  return registry;
}

function call(id: string, name: string, args: unknown) {
  return { id, name, arguments: args };
}

function baseRequest() {
  return { system: "sys", messages: [], conversationId: "c1" };
}

describe("runAgentLoop", () => {
  test("returns a direct answer when the model calls no tool", async () => {
    const { engine } = fakeEngine([{ text: "hello there" }]);
    const result = await runAgentLoop(
      { ...baseRequest(), messages: [{ role: "user", content: "hi" }] },
      { engine, registry: registryWithEcho() },
    );

    expect(result.text).toBe("hello there");
    expect(result.steps).toHaveLength(0);
    expect(result.stoppedReason).toBe("final_answer");
  });

  test("executes one tool call and then answers", async () => {
    const { engine, requests } = fakeEngine([
      { text: "", toolCalls: [call("1", "echo", { value: "a" })] },
      { text: "done" },
    ]);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(result.text).toBe("done");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.status).toBe("completed");
    expect(result.steps[0]!.result).toBe("echo:a");
    // the tool result was fed back to the model
    expect(requests[1]!.messages.some((m) => m.role === "tool")).toBe(true);
  });

  test("executes multiple tool calls across iterations", async () => {
    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "echo", { value: "a" })] },
      { text: "", toolCalls: [call("2", "echo", { value: "b" })] },
      { text: "finished" },
    ]);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(result.steps.map((s) => s.result)).toEqual(["echo:a", "echo:b"]);
    expect(result.text).toBe("finished");
  });

  test("stops at the step limit instead of looping forever", async () => {
    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "echo", { value: "a" })] },
    ]);
    const result = await runAgentLoop(
      baseRequest(),
      { engine, registry: registryWithEcho() },
      { maxSteps: 3 },
    );

    expect(result.stoppedReason).toBe("step_limit");
    expect(result.iterations).toBe(3);
    expect(result.steps).toHaveLength(3);
    expect(result.text).toContain("safety limit");
  });

  test("refuses an unknown tool without failing the turn", async () => {
    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "not_a_tool", {})] },
      { text: "recovered" },
    ]);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(result.steps[0]!.status).toBe("refused");
    expect(result.text).toBe("recovered");
  });

  test("reports invalid arguments as a failed step", async () => {
    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "echo", { value: 42 })] },
      { text: "after invalid args" },
    ]);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(result.steps[0]!.status).toBe("failed");
    expect(result.steps[0]!.error).toContain("schema");
  });

  test("rejects non-JSON argument payloads", async () => {
    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "echo", "{not json")] },
      { text: "ok" },
    ]);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(result.steps[0]!.status).toBe("failed");
    expect(result.steps[0]!.error).toContain("JSON");
  });

  test("never advertises or runs a denied-permission tool", async () => {
    const registry = registryWithEcho();
    registry.register({
      id: "device_thing",
      name: "Device thing",
      description: "Forbidden.",
      requiresApproval: false,
      permissions: ["device:control"],
      inputSchema: z.object({}),
      execute: () => "should never run",
    });

    expect(registry.listForModel().map((t) => t.name)).toEqual(["echo"]);

    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "device_thing", {})] },
      { text: "explained the limitation" },
    ]);
    const result = await runAgentLoop(baseRequest(), { engine, registry });

    expect(result.steps[0]!.status).toBe("refused");
    expect(result.text).toBe("explained the limitation");
    await expect(
      registry.run("device_thing", {}, { conversationId: "c1" }),
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("requires explicit approval before running a gated tool", async () => {
    const registry = registryWithEcho();
    registry.register({
      id: "danger",
      name: "Danger",
      description: "Needs approval.",
      requiresApproval: true,
      permissions: ["read:time"],
      inputSchema: z.object({}),
      execute: () => "ran",
    });

    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "danger", {})] },
      { text: "asked for approval" },
    ]);
    const denied = await runAgentLoop(baseRequest(), { engine, registry });
    expect(denied.steps[0]!.status).toBe("refused");

    const second = fakeEngine([
      { text: "", toolCalls: [call("1", "danger", {})] },
      { text: "approved run" },
    ]);
    const allowed = await runAgentLoop(
      baseRequest(),
      { engine: second.engine, registry },
      { approvedToolIds: ["danger"] },
    );
    expect(allowed.steps[0]!.status).toBe("completed");
    expect(allowed.steps[0]!.result).toBe("ran");
  });

  test("sanitises tool execution failures", async () => {
    const registry = new ToolRegistry();
    registry.register({
      id: "boom",
      name: "Boom",
      description: "Always throws.",
      requiresApproval: false,
      permissions: ["read:time"],
      inputSchema: z.object({}),
      execute: () => {
        throw new Error("SECRET_TOKEN=abc123 leaked internals");
      },
    });

    const { engine } = fakeEngine([
      { text: "", toolCalls: [call("1", "boom", {})] },
      { text: "handled" },
    ]);
    const result = await runAgentLoop(baseRequest(), { engine, registry });

    expect(result.steps[0]!.status).toBe("failed");
    expect(result.steps[0]!.error).not.toContain("SECRET_TOKEN");
    expect(result.text).toBe("handled");
  });

  test("skips tools entirely when the engine has no tool support", async () => {
    const { engine, requests } = fakeEngine([{ text: "plain answer" }], false);
    const result = await runAgentLoop(baseRequest(), {
      engine,
      registry: registryWithEcho(),
    });

    expect(requests[0]!.tools).toBeUndefined();
    expect(result.stoppedReason).toBe("no_tool_support");
    expect(result.steps).toHaveLength(0);
  });

  test("model errors propagate instead of being swallowed", async () => {
    const engine: ModelEngine = {
      provider: "test",
      model: "test-model",
      isConfigured: () => true,
      supportsTools: true,
      async generate() {
        throw new ModelEngineError("unavailable", "engine down");
      },
    };
    await expect(
      runAgentLoop(baseRequest(), { engine, registry: registryWithEcho() }),
    ).rejects.toBeInstanceOf(ModelEngineError);
  });
});
