/**
 * Builder project switcher: New / Open / Rename / Clear / Delete.
 * Every project has its own Workspace Files namespace on the server.
 */
import { useCallback, useEffect, useState } from 'react';

export type ProjectSummary = { id: string; name: string; fileCount: number; updatedAt: string };

export const DEFAULT_PROJECT_ID = 'default';
const STORAGE_KEY = 'v1-active-project';

export function useActiveProject() {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && /^[A-Za-z0-9_-]{1,64}$/.test(saved)) setProjectId(saved);
  }, []);
  const select = useCallback((id: string) => {
    window.localStorage.setItem(STORAGE_KEY, id);
    setProjectId(id);
  }, []);
  return [projectId, select] as const;
}

async function call(body: Record<string, unknown>) {
  const res = await fetch('/api/v1/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string; removed?: number };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export function ProjectBar({
  projectId,
  onSelect,
  onChanged,
  onError,
  version,
}: {
  projectId: string;
  onSelect: (id: string) => void;
  onChanged: () => void;
  onError: (message: string) => void;
  version: number;
}) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/projects');
      const data = (await res.json().catch(() => [])) as ProjectSummary[] | { error?: string };
      if (!res.ok || !Array.isArray(data)) throw new Error((data as { error?: string }).error ?? 'Could not load projects.');
      setProjects(data);
      if (!data.some((p) => p.id === projectId)) onSelect(DEFAULT_PROJECT_ID);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not load projects.');
    }
  }, [projectId, onSelect, onError]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Project action failed.');
    } finally {
      setBusy(false);
    }
  };

  const current = projects.find((p) => p.id === projectId);
  const btn = 'rounded-lg border px-2 py-1 text-xs disabled:opacity-50';
  const style = { borderColor: 'var(--ws-line)', background: 'var(--ws-raised)' };

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
      style={{ borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' }}
      data-testid="panel-project-bar"
    >
      <select
        value={projectId}
        onChange={(e) => onSelect(e.target.value)}
        disabled={busy}
        className="min-w-0 flex-1 rounded-lg border bg-transparent px-2 py-1 text-sm"
        style={{ borderColor: 'var(--ws-line)' }}
        aria-label="Open project"
        data-testid="select-project"
      >
        {projects.length === 0 && <option value={projectId}>Default project</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.fileCount})
          </option>
        ))}
      </select>
      <button type="button" className={btn} style={style} disabled={busy} data-testid="button-project-new"
        onClick={() => {
          const name = window.prompt('New project name', 'New project')?.trim();
          if (name) void run(async () => { const p = await call({ action: 'create', name }); if (p.id) onSelect(p.id); });
        }}>New</button>
      <button type="button" className={btn} style={style} disabled={busy} data-testid="button-project-rename"
        onClick={() => {
          const name = window.prompt('Rename project', current?.name ?? '')?.trim();
          if (name) void run(async () => { await call({ action: 'rename', id: projectId, name }); });
        }}>Rename</button>
      <button type="button" className={btn} style={style} disabled={busy} data-testid="button-project-clear"
        onClick={() => {
          if (window.confirm(`Delete all files in "${current?.name ?? projectId}"? Other projects are not affected.`))
            void run(async () => { await call({ action: 'clear', id: projectId }); });
        }}>Clear</button>
      <button type="button" className={btn} style={{ ...style, color: 'var(--ws-danger)' }} data-testid="button-project-delete"
        disabled={busy || projectId === DEFAULT_PROJECT_ID}
        onClick={() => {
          if (window.confirm(`Delete project "${current?.name ?? projectId}" and all its files? This cannot be undone.`))
            void run(async () => { await call({ action: 'delete', id: projectId }); onSelect(DEFAULT_PROJECT_ID); });
        }}>Delete</button>
    </div>
  );
}
