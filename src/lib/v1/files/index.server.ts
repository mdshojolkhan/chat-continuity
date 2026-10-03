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

async function readRow(path: string): Promise<WorkspaceFile | null> {
  const client = await db();
  const { data, error } = await client
    .from("workspace_files")
    .select(COLUMNS)
    .eq("path", path)
    .maybeSingle();
  if (error) fail("read the file", error);
  return data ? toFile(data as Row) : null;
}

async function put(path: string, content: string): Promise<WorkspaceFile> {
  const bytes = new TextEncoder().encode(content).length;
  if (bytes > MAX_FILE_BYTES) {
    throw new WorkspacePathError(
      `That file is too large (limit ${Math.floor(MAX_FILE_BYTES / 1024)} KB).`,
    );
  }
  const client = await db();
  const existing = await readRow(path);
  if (!existing) {
    const { count, error } = await client
      .from("workspace_files")
      .select("path", { count: "exact", head: true });
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
        path,
        content,
        bytes,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "path" },
    )
    .select(COLUMNS)
    .single();
  if (error || !data) fail("save the file", error);
  return toFile(data as Row);
}

export const workspaceStore: WorkspaceStore = {
  async list() {
    const client = await db();
    const { data, error } = await client
      .from("workspace_files")
      .select(COLUMNS)
      .order("path", { ascending: true })
      .limit(MAX_FILES);
    if (error) fail("list files", error);
    return ((data ?? []) as Row[]).map(toFile);
  },
  async read(path) {
    return readRow(normalizeWorkspacePath(path));
  },
  async write(path, content) {
    return put(normalizeWorkspacePath(path), content);
  },
  async append(path, content) {
    const key = normalizeWorkspacePath(path);
    const existing = await readRow(key);
    return put(key, existing ? `${existing.content}\n${content}` : content);
  },
  async remove(path) {
    const client = await db();
    const { data, error } = await client
      .from("workspace_files")
      .delete()
      .eq("path", normalizeWorkspacePath(path))
      .select("path");
    if (error) fail("delete the file", error);
    return (data ?? []).length > 0;
  },
};

export type { WorkspaceFile, WorkspaceStore };
