import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { AppShell } from '@/components/v1/app-shell';
import { ProvidersSection } from '@/components/v1/providers-section';
import {
  executeTool,
  fetchAssistantStatus,
  fetchTools,
  V1ApiError,
} from '@/lib/v1/client';

export const Route = createFileRoute('/settings')({
  head: () => ({
    meta: [
      { title: 'Settings — V1 Agent' },
      {
        name: 'description',
        content:
          'Review the V1 Agent model engine, permission boundaries and the skills your assistant is allowed to run.',
      },
      { property: 'og:title', content: 'Settings — V1 Agent' },
      {
        property: 'og:description',
        content:
          'Model engine status, permission boundaries and available skills for your V1 Agent.',
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const status = useQuery({
    queryKey: ['v1', 'status'],
    queryFn: fetchAssistantStatus,
  });
  const tools = useQuery({ queryKey: ['v1', 'tools'], queryFn: fetchTools });
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  async function runTool(toolId: string) {
    setRunning(toolId);
    try {
      const response = await executeTool({
        toolId,
        approved: true,
        input:
          toolId === 'analyze_text'
            ? { text: 'V1 Agent is ready. Everything runs behind the API.' }
            : toolId === 'draft_android_permission_plan'
              ? { capability: 'reading notifications' }
              : {},
      });
      setResults((prev) => ({ ...prev, [toolId]: response.result }));
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [toolId]:
          error instanceof V1ApiError ? error.message : 'That skill failed.',
      }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-6 py-12 md:px-10">
        <h1 className="text-[28px] font-semibold tracking-[-0.035em]">
          Settings
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          How your assistant is wired, and exactly what it is allowed to do.
        </p>

        <section className="mt-9 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Model engine</h2>
          {status.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Checking…</p>
          ) : status.data ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd data-testid="text-engine-status">{status.data.message}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="font-mono text-xs">{status.data.provider}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Model</dt>
                <dd className="font-mono text-xs">{status.data.model}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Engine status is unavailable right now.
            </p>
          )}
        </section>

        <ProvidersSection />

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Permission boundaries</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              ['Read the current time', true],
              ['Read this conversation', true],
              ['Save things you ask it to remember', true],
              ['Reach the internet from a skill', false],
              ['Control your phone or device', false],
              ['Run commands or its own code', false],
            ].map(([label, allowed]) => (
              <li key={label as string} className="flex items-center gap-3">
                {allowed ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[hsl(var(--accent))]" />
                ) : (
                  <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={
                    allowed ? '' : 'text-muted-foreground line-through'
                  }
                >
                  {label as string}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">Skills</h2>
          <div className="mt-4 space-y-3">
            {(tools.data ?? []).map((tool) => (
              <div
                key={tool.id}
                className="rounded-xl border border-border/80 p-4"
                data-testid={`card-tool-${tool.id}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{tool.name}</p>
                  {tool.requiresApproval ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Needs approval
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {tool.description}
                </p>
                <button
                  type="button"
                  onClick={() => runTool(tool.id)}
                  disabled={running === tool.id}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-60"
                  data-testid={`button-run-${tool.id}`}
                >
                  {running === tool.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Approve and run once
                </button>
                {results[tool.id] ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-secondary p-3 text-[11px] leading-relaxed text-muted-foreground">
                    {results[tool.id]}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
