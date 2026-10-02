/**
 * Sandboxed workspace contracts.
 *
 * V1 never touches the host filesystem. It owns a virtual workspace of text
 * documents addressed by a normalised, relative path. Swap the default
 * in-process implementation for a database/object-store one behind this
 * interface without touching the skills or the orchestrator.
 */
export type WorkspaceFile = {
  path: string;
  content: string;
  updatedAt: string;
  bytes: number;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

/** Persistent storage is missing or failing (distinct from bad user input). */
export class WorkspaceStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceStorageError";
  }
}

export type WorkspaceStore = {
  list(): Promise<WorkspaceFile[]>;
  read(path: string): Promise<WorkspaceFile | null>;
  write(path: string, content: string): Promise<WorkspaceFile>;
  append(path: string, content: string): Promise<WorkspaceFile>;
  remove(path: string): Promise<boolean>;
};

export const MAX_FILE_BYTES = 64 * 1024;
export const MAX_FILES = 200;

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

/** Reject traversal, absolute paths and anything that is not a plain doc path. */
export function normalizeWorkspacePath(raw: string): string {
  const trimmed = raw.trim().replace(/^\.\//, "");
  if (!trimmed) throw new WorkspacePathError("A file path is required.");
  if (trimmed.length > 200)
    throw new WorkspacePathError("That file path is too long.");
  if (trimmed.startsWith("/") || /^[a-zA-Z]:/.test(trimmed))
    throw new WorkspacePathError("Only workspace-relative paths are allowed.");
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed))
    throw new WorkspacePathError(
      "File paths may only use letters, numbers, dot, dash, underscore and slash.",
    );
  if (trimmed.split("/").some((part) => part === "" || part === ".." || part === "."))
    throw new WorkspacePathError("Path segments like '..' are not allowed.");
  return trimmed;
}
