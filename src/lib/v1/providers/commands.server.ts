/**
 * Minimal command interface for AI provider management. This is the backend
 * foundation for a future terminal UI:
 *
 *   ai list
 *   ai admin <provider>
 *   ai add <provider>      (enables the provider; key comes from Settings or a project secret)
 *   ai remove <provider>
 */
import { PROVIDERS, getProviderDefinition, type ProviderId } from "./registry";
import { listProviders, removeProvider, updateProvider } from "./index.server";

export type CommandResult = { ok: boolean; output: string };

const USAGE = [
  "Usage:",
  "  ai list",
  "  ai admin <provider>",
  "  ai add <provider>",
  "  ai remove <provider>",
  `Providers: ${PROVIDERS.map((p) => p.id).join(", ")}`,
].join("\n");

function parseProvider(raw: string | undefined): ProviderId | null {
  if (!raw) return null;
  return getProviderDefinition(raw.toLowerCase())?.id ?? null;
}

export function runAiCommand(input: string): CommandResult {
  const [root, sub, arg, ...rest] = input.trim().split(/\s+/);
  if (root !== "ai" || !sub || rest.length > 0) return { ok: false, output: USAGE };

  if (sub === "list") {
    if (arg) return { ok: false, output: USAGE };
    const lines = listProviders().map((p) => {
      const role = p.role === "admin" ? "ADMIN AI" : p.role === "helper" ? "HELPER AI" : "disabled";
      const key = p.configured ? `key ••••${p.keyHint}` : "no key";
      return `${p.id.padEnd(8)} ${role.padEnd(10)} ${p.model} (${key}, ${p.status})`;
    });
    return { ok: true, output: lines.join("\n") };
  }

  const id = parseProvider(arg);
  if (!id) return { ok: false, output: `Unknown provider "${arg ?? ""}".\n${USAGE}` };

  try {
    switch (sub) {
      case "admin":
        updateProvider(id, { admin: true });
        return { ok: true, output: `${id} is now the ADMIN AI. Other enabled providers are HELPER AIs.` };
      case "add":
        updateProvider(id, { enabled: true });
        return { ok: true, output: `${id} enabled as a HELPER AI.` };
      case "remove":
        removeProvider(id);
        return { ok: true, output: `${id} configuration removed.` };
      default:
        return { ok: false, output: USAGE };
    }
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : "Command failed." };
  }
}
