/**
 * Minimal Build Terminal: prompt → V1 agent edits real project files in the
 * Workspace Files store. Permissions are enforced server-side (Admin may
 * write, Helper is refused); this component only reports what happened.
 */
import { useState } from 'react';
import { sendChatMessage, V1ApiError } from '@/lib/v1/client';

type Status = 'IDLE' | 'BUILDING' | 'SUCCESS' | 'ERROR';

const BUILD_PREFIX = [
  'IMPLEMENTATION REQUEST. You are the V1 Admin AI implementing a real application in the V1 workspace.',
  'Step 1: call file_list (and file_read on relevant files) to inspect existing Workspace Files.',
  'Step 2: implement the request as real, runnable source files split by responsibility, using file_write:',
  'e.g. package.json with dependencies and scripts, server code (server/index.js or src/server/*.ts),',
  'frontend code (src/*.tsx/.ts/.js, components, styles), and required config files. Reuse and modify existing files when appropriate.',
  'Never write architecture guides, blueprint pages, simulators, fake demo HTML, or Markdown docs,',
  'and never put an entire application inside one HTML file. A small index.html entry that loads separate script files is fine.',
  'Reply with a short list of files changed.',
  'Request:',
].join(' ');

const WRITE_TOOLS = new Set(['file_write', 'file_delete']);
const MAX_FIX_ATTEMPTS = 3;
const FIX_PREFIX = [
  'IMPLEMENTATION REQUEST (fix pass). The previous build for the V1 workspace failed validation.',
  'Use file_read/file_list to inspect the relevant project source files, then fix the problem with file_write',
  '(or file_delete for documentation/demo files that should not exist). Implement real, separate source files;',
  'no documentation, blueprint/simulator pages, or single-file HTML apps. Reply with a short list of files changed.',
].join(' ');

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs|json|css|scss|vue|svelte|py|go|rs|toml|ya?ml|env\.example)$/i;
const DOC_EXT = /\.(md|mdx|txt|rst)$/i;
const FAKE_DOC = /architecture (guide|overview)|blueprint|simulat(or|ion)|implementation guide|how it works/i;

/** True only when the user explicitly asks for documentation. */
export function wantsDocumentation(text: string): boolean {
  if (/\b(do not|don't|dont|no|without)\s+(create\s+|write\s+|generate\s+|add\s+)?(any\s+)?(documentation|docs?)\b/i.test(text)) return false;
  return /\b(write|create|generate|add)\s+(the\s+|a\s+|some\s+)?(documentation|docs|readme)\b/i.test(text);
}

/** Validates that written files are a real implementation, not docs/demo HTML. */
export function validateImplementation(files: Map<string, string>, allowDocs: boolean): string[] {
  if (allowDocs || files.size === 0) return [];
  const errors: string[] = [];
  const paths = [...files.keys()];
  if (!paths.some((p) => SOURCE_EXT.test(p))) {
    errors.push('No real source files were written (only HTML/docs). Create separate frontend/backend source and config files.');
  }
  for (const [p, content] of files) {
    if (DOC_EXT.test(p)) errors.push(`${p}: documentation file written but not requested; delete it and implement source code.`);
    if (/\.html?$/i.test(p)) {
      const inlineScript = (content.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) ?? []).join('').length;
      if (FAKE_DOC.test(content)) errors.push(`${p}: looks like a documentation/blueprint/demo page; replace it with real implementation files.`);
      else if (inlineScript > 1500) errors.push(`${p}: entire app inlined into one HTML file; move logic into separate source files.`);
    }
  }
  return errors;
}

export function BuildTerminal({ onBuilt, projectId }: { onBuilt?: () => void; projectId?: string }) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<Status>('IDLE');
  const [lines, setLines] = useState<string[]>([]);

  const build = async () => {
    const text = prompt.trim();
    if (!text || status === 'BUILDING') return;
    setStatus('BUILDING');
    const out: string[] = [`$ build "${text.slice(0, 80)}"`];
    const log = (line: string) => {
      out.push(line);
      setLines([...out]);
    };
    setLines([...out]);

    const touched = new Set<string>();
    const written = new Map<string, string>();
    const allowDocs = wantsDocumentation(text);
    let message = `${BUILD_PREFIX} ${text}`;
    let anyWrite = false;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      if (attempt > 0) log(`$ auto-fix attempt ${attempt}/${MAX_FIX_ATTEMPTS}`);
      try {
        const res = await sendChatMessage({
          message: message.slice(0, 8000),
          mode: 'programming',
          conversationId: `v1-build-terminal-${projectId ?? 'default'}`,
          ...(projectId ? { projectId } : {}),
        });
        log(`> provider: ${res.provider}  role: ${res.aiRole ?? 'unknown'}`);
        const steps = res.steps ?? [];
        for (const s of steps) {
          const path = typeof s.input?.['path'] === 'string' ? s.input['path'] : '';
          if (path) touched.add(path);
          log(`> [${s.status}] ${s.toolId}${path ? ` ${path}` : ''}${s.error ? ` — ${s.error}` : ''}`);
        }
        // Helpers can never write; the server refuses it. Stop immediately.
        if (res.aiRole === 'helper') {
          log('! Helper AI cannot modify files. Select an Admin AI in Settings → AI Providers.');
          setStatus('ERROR');
          return;
        }
        const wrote = steps.filter((s) => WRITE_TOOLS.has(s.toolId) && s.status === 'completed');
        if (wrote.length) anyWrite = true;
        for (const s of wrote) {
          const p = typeof s.input?.['path'] === 'string' ? s.input['path'] : '';
          if (!p) continue;
          if (s.toolId === 'file_delete') written.delete(p);
          else written.set(p, typeof s.input?.['content'] === 'string' ? s.input['content'] : '');
        }
        // Validation: every step must succeed and at least one file change must exist.
        const errors = steps
          .filter((s) => s.status === 'failed' || s.status === 'refused')
          .map((s) => `${s.toolId}${typeof s.input?.['path'] === 'string' ? ` ${s.input['path']}` : ''}: ${s.error ?? s.status}`);
        if (!anyWrite) errors.push('No project files were modified.');
        errors.push(...validateImplementation(written, allowDocs));
        if (!errors.length) {
          log(`✓ validation passed (${wrote.length} file change(s) this pass).`);
          if (res.message) log(res.message);
          setStatus('SUCCESS');
          onBuilt?.();
          return;
        }
        lastError = errors.join('\n');
      } catch (e) {
        lastError = e instanceof V1ApiError || e instanceof Error ? e.message : 'Build failed.';
      }
      log(`! error:\n${lastError}`);
      if (attempt < MAX_FIX_ATTEMPTS) {
        message = [
          FIX_PREFIX,
          `Original request: ${text}`,
          `Errors:\n${lastError}`,
          touched.size ? `Relevant files: ${[...touched].slice(0, 30).join(', ')}` : 'Relevant files: use file_list to locate them.',
        ].join('\n');
      }
    }
    log(`! ${MAX_FIX_ATTEMPTS} auto-fix attempts used. Remaining error:\n${lastError}`);
    if (anyWrite) onBuilt?.();
    setStatus('ERROR');
  };

  const statusColor =
    status === 'SUCCESS' ? 'var(--ws-accent)' : status === 'ERROR' ? 'var(--ws-danger)' : 'var(--ws-muted)';

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' }}
      data-testid="panel-build-terminal"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium">Build Terminal</h3>
        <span className="font-mono text-xs" style={{ color: statusColor }} data-testid="text-build-status">
          {status}
        </span>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe the change to build into project files…"
        rows={2}
        className="w-full resize-none rounded-lg border bg-transparent p-2 text-sm outline-none"
        style={{ borderColor: 'var(--ws-line)' }}
        data-testid="input-build-prompt"
      />
      <button
        type="button"
        onClick={build}
        disabled={status === 'BUILDING' || !prompt.trim()}
        className="mt-2 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
        style={{ borderColor: 'var(--ws-accent)', background: 'var(--ws-raised)' }}
        data-testid="button-build"
      >
        {status === 'BUILDING' ? 'Building…' : 'Build'}
      </button>
      <pre
        className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border p-2 font-mono text-xs"
        style={{ borderColor: 'var(--ws-line)', background: 'var(--ws-raised)', color: 'var(--ws-muted)' }}
        data-testid="output-build-terminal"
      >
        {lines.length ? lines.join('\n') : '$ ready'}
      </pre>
    </div>
  );
}
