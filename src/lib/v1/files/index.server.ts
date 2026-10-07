/**
 * Default workspace implementation: persisted in the Lovable Cloud database
 * (`public.workspace_files`). Server-only — the table has RLS enabled with no
 * policies, so only the service-role client used here can read or write it.
 * Same interface, size and count limits as before.
 */
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  WorkspacePathError,
  WorkspaceStorageError,
  normalizeWorkspacePath,
  type WorkspaceFile,
  type WorkspaceStore,
} from "./store";

type Row = {
  path: string;
  content: string;
  bytes: number;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

const COLUMNS = "path, content, bytes, metadata, created_at, updated_at";

async function db() {
  try {
    const { supabaseAdmin } = await import("./supabase-admin.server");
    // The admin client is created lazily; touch it here so missing
    // SUPABASE_URL / SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)
    // surface as a clear storage error.
    void supabaseAdmin.from;
    return supabaseAdmin;
  } catch (error) {
    console.error("[workspace] storage client unavailable", error);
    throw new WorkspaceStorageError(
      "Workspace storage is not configured. Files cannot be loaded or saved right now.",
    );
  }
}

function fail(action: string, error: { message?: string } | null | unknown): never {
  console.error(`[workspace] ${action} failed`, error);
  throw new WorkspaceStorageError(
    `Workspace storage is unavailable (could not ${action}). Please try again.`,
  );
}

function toFile(row: Row): WorkspaceFile {
  return {
    path: row.path,
    content: row.content,
    bytes: row.bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

async function readRow(projectId: string, path: string): Promise<WorkspaceFile | null> {
  const client = await db();
  const { data, error } = await client
    .from("workspace_files")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .eq("path", path)
    .maybeSingle();
  if (error) fail("read the file", error);
  return data ? toFile(data as Row) : null;
}

async function put(projectId: string, path: string, content: string): Promise<WorkspaceFile> {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_FILE_BYTES) {
    throw new WorkspacePathError(
      `That file is too large (limit ${Math.floor(MAX_FILE_BYTES / 1024)} KB).`,
    );
  }
  const client = await db();
  const existing = await readRow(projectId, path);
  if (!existing) {
    const { count, error } = await client
      .from("workspace_files")
      .select("path", { count: "exact", head: true })
      .eq("project_id", projectId);
    if (error) fail("count files", error);
    if ((count ?? 0) >= MAX_FILES) {
      throw new WorkspacePathError(
        "The workspace is full. Delete a file before creating another.",
      );
    }
  }
  const ext = path.includes(".") ? path.split(".").pop()!.toLowerCase() : "";
  const metadata = { ...(existing?.metadata ?? {}), extension: ext };
  const { data, error } = await client
    .from("workspace_files")
    .upsert(
      {
        project_id: projectId,
        path,
        content,
        bytes,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,path" },
    )
    .select(COLUMNS)
    .single();
  if (error || !data) fail("save the file", error);
  return toFile(data as Row);
}

export const DEFAULT_PROJECT_ID = "default";

export function normalizeProjectId(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return DEFAULT_PROJECT_ID;
  const id = raw.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new WorkspacePathError("That project id is not valid.");
  }
  return id;
}

/** Workspace store scoped to one project's file namespace. */
export function workspaceFor(rawProjectId?: string | null): WorkspaceStore & {
  clear(): Promise<number>;
} {
  const projectId = normalizeProjectId(rawProjectId);
  return {
    async list() {
      const client = await db();
      const { data, error } = await client
        .from("workspace_files")
        .select(COLUMNS)
        .eq("project_id", projectId)
        .order("path", { ascending: true })
        .limit(MAX_FILES);
      if (error) fail("list files", error);
      return ((data ?? []) as Row[]).map(toFile);
    },
    async read(path) {
      return readRow(projectId, normalizeWorkspacePath(path));
    },
    async write(path, content) {
      return put(projectId, normalizeWorkspacePath(path), content);
    },
    async append(path, content) {
      const key = normalizeWorkspacePath(path);
      const existing = await readRow(projectId, key);
      return put(projectId, key, existing ? `${existing.content}\n${content}` : content);
    },
    async remove(path) {
      const client = await db();
      const { data, error } = await client
        .from("workspace_files")
        .delete()
        .eq("project_id", projectId)
        .eq("path", normalizeWorkspacePath(path))
        .select("path");
      if (error) fail("delete the file", error);
      return (data ?? []).length > 0;
    },
    async clear() {
      const client = await db();
      const { data, error } = await client
        .from("workspace_files")
        .delete()
        .eq("project_id", projectId)
        .select("path");
      if (error) fail("clear the project", error);
      return (data ?? []).length;
    },
  };
}

/** Default project store (existing files live here). */
export const workspaceStore: WorkspaceStore = workspaceFor(DEFAULT_PROJECT_ID);

export type ProjectSummary = { id: string; name: string; fileCount: number; updatedAt: string };

export const projectStore = {
  async list(): Promise<ProjectSummary[]> {
    const client = await db();
    const { data, error } = await client
      .from("workspace_projects")
      .select("id, name, updated_at")
      .order("created_at", { ascending: true });
    if (error) fail("list projects", error);
    const { data: files, error: fErr } = await client
      .from("workspace_files")
      .select("project_id");
    if (fErr) fail("count project files", fErr);
    const counts = new Map<string, number>();
    for (const f of files ?? []) counts.set(f.project_id, (counts.get(f.project_id) ?? 0) + 1);
    const rows = data ?? [];
    if (!rows.some((r) => r.id === DEFAULT_PROJECT_ID)) {
      rows.unshift({ id: DEFAULT_PROJECT_ID, name: "Default project", updated_at: new Date().toISOString() });
    }
    return rows.map((r) => ({ id: r.id, name: r.name, fileCount: counts.get(r.id) ?? 0, updatedAt: r.updated_at }));
  },
  async create(name: string): Promise<ProjectSummary> {
    const client = await db();
    const id = `p-${crypto.randomUUID().slice(0, 12)}`;
    const { data, error } = await client
      .from("workspace_projects")
      .insert({ id, name })
      .select("id, name, updated_at")
      .single();
    if (error || !data) fail("create the project", error);
    return { id: data.id, name: data.name, fileCount: 0, updatedAt: data.updated_at };
  },
  async rename(rawId: string, name: string): Promise<void> {
    const id = normalizeProjectId(rawId);
    const client = await db();
    const { error } = await client
      .from("workspace_projects")
      .upsert({ id, name, updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) fail("rename the project", error);
  },
  async remove(rawId: string): Promise<void> {
    const id = normalizeProjectId(rawId);
    if (id === DEFAULT_PROJECT_ID) {
      throw new WorkspacePathError("The default project cannot be deleted. Use Clear instead.");
    }
    await workspaceFor(id).clear();
    const client = await db();
    const { error } = await client.from("workspace_projects").delete().eq("id", id);
    if (error) fail("delete the project", error);
  },
};

export type { WorkspaceFile, WorkspaceStore };
