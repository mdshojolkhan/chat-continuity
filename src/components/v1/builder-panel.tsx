/**
 * Builder body: prompt → V1 agent generates workspace files → files list →
 * edit/save → live preview built from the current workspace files.
 * Uses only the existing chat API and workspace API (no duplicate systems).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendChatMessage, V1ApiError } from '@/lib/v1/client';
import { BuildTerminal } from './build-terminal';
import { ProjectBar, useActiveProject } from './project-bar';
import type { WorkspaceFileSummary } from '@/lib/v1/types';

const GENERATE_PREFIX = [
  'Build this as a small static website inside the V1 workspace.',
  'Use the file_write skill to save the files: site/index.html, site/styles.css and site/script.js (script optional).',
  'index.html must link "styles.css" and "script.js" with relative paths.',
  'If those files already exist, read them first and update them instead of starting over.',
  'After saving, reply with a short summary of what you built.',
  'Request:',
].join(' ');

async function readFile(projectId: string, path: string): Promise<string> {
  const res = await fetch(`/api/v1/workspace?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`);
  const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Could not open that file.');
  return data.content ?? '';
}

const PREVIEW_ENTRIES = ['site/index.html', 'index.html', 'public/index.html', 'src/index.html'];

function resolvePath(dir: string, href: string): string {
  const parts = (href.startsWith('/') ? href.slice(1) : `${dir}${href}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p && p !== '.') out.push(p);
  }
  return out.join('/');
}

/** Renders the active project's entry HTML with its local CSS/JS inlined. */
export function buildPreview(files: Record<string, string>): string | null {
  const entry = PREVIEW_ENTRIES.find((p) => files[p] !== undefined);
  if (!entry) return null;
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const lookup = (href: string) => {
    if (/^(https?:)?\/\//i.test(href)) return undefined;
    return files[resolvePath(dir, href)] ?? (href.startsWith('/') ? files[resolvePath(dir, href.slice(1))] : undefined);
  };
  return files[entry]!
    .replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, href: string) => {
      const css = lookup(href);
      return css === undefined ? tag : `<style>${css}</style>`;
    })
    .replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (tag, a: string, href: string, b: string) => {
      const js = lookup(href);
      if (js === undefined) return tag;
      const attrs = `${a}${b}`.replace(/\s+/g, ' ').trim();
      return `<script${attrs ? ` ${attrs}` : ''}>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
    });
}

export function BuilderPanel({
  tool,
  maxWidth,
  filesOpen,
}: {
  tool: string;
  maxWidth: string;
  filesOpen: boolean;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [files, setFiles] = useState<WorkspaceFileSummary[]>([]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [projectId, selectProject] = useActiveProject();
  const [projectsVersion, setProjectsVersion] = useState(0);
  const reportError = useCallback((m: string) => setError(m), []);
  // Latest active project; responses for any other project are ignored.
  const generatingRef = useRef(false);
  const activeRef = useRef(projectId);
  activeRef.current = projectId;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/workspace?projectId=${encodeURIComponent(projectId)}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Could not load workspace files.');
      }
      const list = (await res.json()) as WorkspaceFileSummary[];
      if (activeRef.current !== projectId) return;
      setFiles(list);
      const web = list.filter((f) => /\.(html?|css|js)$/i.test(f.path));
      const entries = await Promise.all(
        web.map(async (f) => [f.path, await readFile(projectId, f.path)] as const),
      );
      if (activeRef.current !== projectId) return;
      setContents(Object.fromEntries(entries));
    } catch (e) {
      if (activeRef.current !== projectId) return;
      setError(e instanceof Error ? e.message : 'Could not load workspace files.');
    }
  }, [projectId]);

  useEffect(() => {
    // Switching projects: reset per-project view state, then load its files.
    setOpenPath(null);
    setDraft('');
    setFiles([]);
    setContents({});
    setNotice(null);
    setError(null);
    void refresh();
  }, [refresh]);

  const generate = async () => {
    const text = prompt.trim();
    if (!text || busy || generatingRef.current) return;
    generatingRef.current = true;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await sendChatMessage({
        message: `${GENERATE_PREFIX} ${text}`.slice(0, 8000),
        mode: 'programming',
        conversationId: `v1-builder-${projectId}`,
        projectId,
      });
      const wrote = (res.steps ?? []).filter(
        (s) => s.toolId === 'file_write' && s.status === 'completed',
      );
      if (!wrote.length) {
        setError(
          res.aiRole === 'helper'
            ? 'A Helper AI cannot write files. Select an Admin AI in Settings → AI Providers.'
            : /local/i.test(res.provider)
              ? 'No AI model is connected, so no files were created. Add an API key and set an Admin AI in Settings → AI Providers.'
              : 'The AI replied but did not save any files. Try a more specific prompt.',
        );
      } else {
        setSummary(res.message);
      }
      await refresh();
    } catch (e) {
      setError(
        e instanceof V1ApiError || e instanceof Error ? e.message : 'Generation failed.',
      );
    } finally {
      generatingRef.current = false;
      setBusy(false);
    }
  };

  const open = async (path: string) => {
    setError(null);
    try {
      const forProject = projectId;
      const content = await readFile(forProject, path);
      if (activeRef.current !== forProject) return;
      setOpenPath(path);
      setNotice(null);
      setDraft(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const save = async () => {
    if (!openPath) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, path: openPath, content: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Save failed (HTTP ${res.status}).`);
      // Read back from the workspace to confirm the content really persisted.
      const stored = await readFile(projectId, openPath);
      if (stored !== draft) throw new Error('Save failed: the stored file does not match your edits.');
      await refresh();
      setProjectsVersion((v) => v + 1);
      setNotice(`Saved ${openPath}.`);
    } catch (e) {
      setError(e instanceof Error ? `Save failed: ${e.message.replace(/^Save failed:?\s*/, '')}` : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (path: string) => {
    if (deleting) return;
    if (!window.confirm(`Delete ${path}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/v1/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, path }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; result?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (openPath === path) {
        setOpenPath(null);
        setDraft('');
      }
      await refresh();
      setNotice(data.result ?? `Deleted ${path}.`);
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const preview = useMemo(() => buildPreview(contents), [contents]);
  const box = { borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' };
  // Preview tab: only the rendered app. Files/Edit: file list + editor, never the preview.
  const filesMode = filesOpen || tool === 'Files' || tool === 'Edit';
  const previewOnly = tool === 'Preview';
  const showPrompt = !previewOnly && !filesMode;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <ProjectBar
        projectId={projectId}
        onSelect={selectProject}
        onChanged={() => void refresh()}
        onError={reportError}
        version={projectsVersion}
      />
      {showPrompt && (
        <div className="rounded-xl border p-3" style={box}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the app or website you want to build…"
            rows={3}
            className="w-full resize-none rounded-lg border bg-transparent p-2 text-sm outline-none"
            style={{ borderColor: 'var(--ws-line)' }}
            data-testid="input-builder-prompt"
          />
          <button
            type="button"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="mt-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--ws-accent)', background: 'var(--ws-raised)' }}
            data-testid="button-builder-generate"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
          {summary ? (
            <p className="mt-2 whitespace-pre-wrap text-xs" style={{ color: 'var(--ws-muted)' }}>
              {summary}
            </p>
          ) : null}
        </div>
      )}

      {showPrompt && <BuildTerminal
          key={projectId}
          projectId={projectId}
          onBuilt={() => {
            void refresh();
            setProjectsVersion((v) => v + 1);
          }}
        />}

      {error ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--ws-danger)', color: 'var(--ws-danger)' }}
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {notice && !previewOnly ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--ws-accent)', color: 'var(--ws-accent)' }}
          role="status"
          data-testid="text-builder-notice"
        >
          {notice}
        </p>
      ) : null}

      {filesMode && (
        <div className="rounded-xl border p-3" style={box} data-testid="panel-files">
          <h3 className="mb-2 text-sm font-medium">Project Files</h3>
          {files.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>
              No files yet. Use Prompt → Generate.
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => open(f.path)}
                    className="w-full rounded px-2 py-1 text-left"
                    style={{
                      color: openPath === f.path ? 'var(--ws-accent)' : 'var(--ws-muted)',
                    }}
                  >
                    📄 {f.path} <span className="text-xs">({f.bytes} B)</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {filesMode && openPath ? (
        <div className="rounded-xl border p-3" style={box}>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="truncate">{openPath}</span>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-lg border px-2.5 py-1 disabled:opacity-50"
                style={{ borderColor: 'var(--ws-accent)' }}
                data-testid="button-builder-save"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => remove(openPath)}
                disabled={deleting || saving}
                className="rounded-lg border px-2.5 py-1 disabled:opacity-50"
                style={{ borderColor: 'var(--ws-danger)', color: 'var(--ws-danger)' }}
                data-testid="button-builder-delete"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={() => setOpenPath(null)}
                className="rounded-lg border px-2.5 py-1"
                style={{ borderColor: 'var(--ws-line)' }}
              >
                Close
              </button>
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            rows={14}
            className="w-full rounded-lg border bg-transparent p-2 font-mono text-xs outline-none"
            style={{ borderColor: 'var(--ws-line)' }}
            data-testid="input-builder-editor"
          />
        </div>
      ) : null}

      {!filesMode && (
      <div
        className="flex min-h-[320px] flex-1 justify-center rounded-xl border p-3"
        style={box}
      >
        {preview ? (
          <iframe
            title="Workspace preview"
            srcDoc={preview}
            sandbox="allow-scripts"
            className="h-full min-h-[300px] w-full rounded-lg bg-background"
            style={{ maxWidth }}
            data-testid="frame-builder-preview"
          />
        ) : (
          <p className="self-center text-sm" style={{ color: 'var(--ws-muted)' }}>
            No preview yet — generate a site to create site/index.html.
          </p>
        )}
      </div>
      )}
    </div>
  );
}
