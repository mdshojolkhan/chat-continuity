import { describe, expect, test } from "bun:test";
import { toolRegistry } from "../tools/builtin.server";

describe("AI role permissions", () => {
  test("helper cannot see or run workspace write tools", async () => {
    const names = toolRegistry.listForModel("helper").map((t) => t.name);
    expect(names).not.toContain("file_write");
    expect(names).toContain("file_read");
    expect(await toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t", aiRole: "helper" }).then(() => false, () => true)).toBe(true);
  });
  test("missing role defaults to helper", async () => {
    expect(await toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t" }).then(() => false, () => true)).toBe(true);
  });
  test("admin can write", async () => {
    expect(toolRegistry.listForModel("admin").map((t) => t.name)).toContain("file_write");
    const out = await toolRegistry.run("file_write", { path: "a.txt", content: "x" }, { conversationId: "t", aiRole: "admin" });
    expect(out).toContain("Saved");
  });
  test("helper and missing role cannot delete files", async () => {
    const denied = (ctx: { conversationId: string; aiRole?: "helper" }) =>
      toolRegistry.run("file_delete", { path: "a.txt" }, ctx, { approved: true }).then(() => false, () => true);
    expect(await denied({ conversationId: "t", aiRole: "helper" })).toBe(true);
    expect(await denied({ conversationId: "t" })).toBe(true);
  });
  test("user (Files panel) can delete a file", async () => {
    const path = "test-user-delete.txt";
    await toolRegistry.run("file_write", { path, content: "x" }, { conversationId: "t", aiRole: "user" });
    const out = await toolRegistry.run("file_delete", { path }, { conversationId: "t", aiRole: "user" }, { approved: true });
    expect(out).toContain("Deleted");
    // clean up the file the admin test writes
    await toolRegistry.run("file_delete", { path: "a.txt" }, { conversationId: "t", aiRole: "user" }, { approved: true });
  });
});
