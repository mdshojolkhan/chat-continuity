/**
 * ZIP-to-APK Builder panel: builds the active project's Workspace Files into
 * a real Android APK via the server-side GitHub Actions integration.
 * Download is enabled only after a real successful build.
 */
import { useEffect, useRef, useState } from 'react';

type ApkStatus = 'IDLE' | 'BUILDING' | 'SUCCESS' | 'ERROR';

const POLL_MS = 10_000;
const MAX_POLLS = 180; // ~30 minutes

export function ApkBuilder({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<ApkStatus>('IDLE');
  const [message, setMessage] = useState<string | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Switching projects cancels any in-flight polling for the previous project.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('IDLE');
    setMessage(null);
    setRunId(null);
    pollsRef.current = 0;
  }, [projectId]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const poll = (id: number) => {
    if (pollsRef.current++ >= MAX_POLLS) {
      setStatus('ERROR');
      setMessage('The build is taking too long. Check the build repository on GitHub.');
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/apk?runId=${id}`);
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          conclusion?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.status === 'completed') {
          if (data.conclusion === 'success') {
            setStatus('SUCCESS');
            setMessage('Build succeeded. Your APK is ready to download.');
          } else {
            setStatus('ERROR');
            setMessage(`The build failed (${data.conclusion ?? 'unknown'}). Check the workflow logs on GitHub.`);
          }
          return;
        }
        setMessage(data.status === 'in_progress' ? 'Building APK on GitHub Actions…' : 'Build queued on GitHub Actions…');
        poll(id);
      } catch (e) {
        setStatus('ERROR');
        setMessage(e instanceof Error ? e.message : 'Could not check the build status.');
      }
    }, POLL_MS);
  };

  const start = async () => {
    if (status === 'BUILDING') return;
    setStatus('BUILDING');
    setMessage('Uploading project and starting the build…');
    setRunId(null);
    pollsRef.current = 0;
    try {
      const res = await fetch('/api/v1/apk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', projectId }),
      });
      const data = (await res.json().catch(() => ({}))) as { runId?: number; error?: string };
      if (!res.ok || typeof data.runId !== 'number') {
        throw new Error(data.error ?? `Could not start the build (HTTP ${res.status}).`);
      }
      setRunId(data.runId);
      setMessage('Build started on GitHub Actions…');
      poll(data.runId);
    } catch (e) {
      setStatus('ERROR');
      setMessage(e instanceof Error ? e.message : 'Could not start the build.');
    }
  };

  const download = () => {
    if (status !== 'SUCCESS' || runId === null) return;
    const a = document.createElement('a');
    a.href = `/api/v1/apk?runId=${runId}&download=1`;
    a.download = 'app-debug.apk';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const statusColor =
    status === 'SUCCESS'
      ? 'var(--ws-accent)'
      : status === 'ERROR'
        ? 'var(--ws-danger)'
        : 'var(--ws-muted)';

  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: 'var(--ws-line)', background: 'var(--ws-panel)' }}
      data-testid="panel-apk-builder"
    >
      <h3 className="mb-2 text-sm font-medium">Build Android APK</h3>
      <p className="mb-2 text-xs" style={{ color: 'var(--ws-muted)' }}>
        Packages this project&apos;s web app into a real APK using a GitHub Actions Android build.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={status === 'BUILDING'}
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
          style={{ borderColor: 'var(--ws-accent)', background: 'var(--ws-raised)' }}
          data-testid="button-apk-build"
        >
          {status === 'BUILDING' ? 'Building…' : 'Build APK'}
        </button>
        {status === 'SUCCESS' && runId !== null ? (
          <button
            type="button"
            onClick={download}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--ws-accent)', background: 'var(--ws-raised)' }}
            data-testid="button-apk-download"
          >
            Download APK
          </button>
        ) : null}
        <span className="text-xs font-medium" style={{ color: statusColor }} data-testid="text-apk-status">
          {status}
        </span>
      </div>
      {message ? (
        <p
          className="mt-2 text-xs"
          style={{ color: status === 'ERROR' ? 'var(--ws-danger)' : 'var(--ws-muted)' }}
          role={status === 'ERROR' ? 'alert' : 'status'}
          data-testid="text-apk-message"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
