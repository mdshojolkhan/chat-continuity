import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  fetchProviders,
  removeProviderConfig,
  saveProvider,
  testProviderConnection,
  V1ApiError,
} from "@/lib/v1/client";
import type { PublicProvider } from "@/lib/v1/providers/registry";

const KEY = ["v1", "providers"];

export function ProvidersSection() {
  const providers = useQuery({ queryKey: KEY, queryFn: fetchProviders });
  const qc = useQueryClient();
  const [adminError, setAdminError] = useState<string | null>(null);
  const list = providers.data ?? [];
  const admin = list.find((p) => p.role === "admin");
  const eligible = list.filter((p) => p.enabled && p.configured);

  async function changeAdmin(value: string) {
    setAdminError(null);
    try {
      if (value === "") {
        if (admin) await saveProvider({ id: admin.id, admin: false });
      } else {
        await saveProvider({ id: value as PublicProvider["id"], admin: true });
      }
      await qc.invalidateQueries({ queryKey: KEY });
      await qc.invalidateQueries({ queryKey: ["v1", "status"] });
    } catch (e) {
      setAdminError(e instanceof V1ApiError ? e.message : "Could not change the Admin AI.");
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">AI Providers</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Keys are sent to the server once and never shown again. Only the last 4
        characters are displayed.
      </p>
      <div className="mt-4 rounded-xl border border-border/80 p-4">
        <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-semibold tracking-wide">
            ADMIN AI: <span data-testid="text-admin-ai">{admin ? admin.displayName : "Built-in V1 engine"}</span>
          </span>
          <select
            value={admin?.id ?? ""}
            onChange={(e) => changeAdmin(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
            aria-label="Choose Admin AI"
            data-testid="select-admin-ai"
          >
            <option value="">Built-in V1 engine</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>{p.displayName}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Only the Admin AI can create, edit or delete workspace files and run the App
          Builder. Every other enabled provider is a Helper AI: chat, analysis and code
          suggestions only. This is enforced on the server.
        </p>
        {adminError ? <p className="mt-2 text-xs text-destructive">{adminError}</p> : null}
      </div>
      <div className="mt-3 space-y-3">
        {providers.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          (providers.data ?? []).map((p) => <ProviderCard key={p.id} provider={p} />)
        )}
      </div>
    </section>
  );
}

function ProviderCard({ provider: p }: { provider: PublicProvider }) {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(p.model);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: KEY });
      await qc.invalidateQueries({ queryKey: ["v1", "status"] });
    } catch (e) {
      setError(e instanceof V1ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const statusText = !p.configured
    ? "Not configured"
    : p.status === "connected"
      ? "Connected"
      : p.status === "failed"
        ? "Connection failed"
        : "Not tested";
  const btn =
    "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:opacity-60";

  return (
    <div className="rounded-xl border border-border/80 p-4" data-testid={`card-provider-${p.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{p.displayName}</p>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {statusText}
            </span>
            {p.role === "admin" ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                Admin AI
              </span>
            ) : p.role === "helper" ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Helper AI
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
          {p.keyHint ? (
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Key ••••{p.keyHint} ({p.keySource === "secret" ? "project secret" : "saved in settings"})
            </p>
          ) : null}
          {p.statusMessage ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{p.statusMessage}</p>
          ) : null}
        </div>
        <Switch
          checked={p.enabled}
          disabled={busy !== null}
          aria-label={`Enable ${p.displayName}`}
          onCheckedChange={(enabled) => run("toggle", () => saveProvider({ id: p.id, enabled }))}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input
          type="password"
          autoComplete="off"
          placeholder={p.configured ? "Replace API key" : "Paste API key"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs"
        />
        <input
          list={`models-${p.id}`}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-1.5 font-mono text-xs"
          aria-label="Model"
        />
        <datalist id={`models-${p.id}`}>
          {p.models.map((m) => <option key={m} value={m} />)}
        </datalist>
      </div>
      <a href={p.keyUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-muted-foreground underline">
        Get an API key
      </a>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy !== null}
          onClick={() =>
            run("save", async () => {
              await saveProvider({ id: p.id, model, ...(apiKey ? { apiKey } : {}) });
              setApiKey("");
            })
          }
        >
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
        <button type="button" className={btn} disabled={busy !== null || !p.configured} onClick={() => run("test", () => testProviderConnection(p.id))}>
          {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Test connection
        </button>
        <button type="button" className={btn} disabled={busy !== null} onClick={() => run("remove", () => removeProviderConfig(p.id))}>
          Remove
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
