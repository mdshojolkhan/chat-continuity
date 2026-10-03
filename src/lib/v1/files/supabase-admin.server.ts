/**
 * Server-only Supabase admin client for Workspace storage.
 * Reads SUPABASE_URL plus SUPABASE_SECRET_KEY (current API key system),
 * falling back to the legacy SUPABASE_SERVICE_ROLE_KEY. SUPABASE_SECRET_KEY wins
 * when both are set. Keys are read lazily, only inside server handlers.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    // New-format keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const url = process.env["SUPABASE_URL"];
  const secretKey = process.env["SUPABASE_SECRET_KEY"] || process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !secretKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!secretKey ? ["SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(url, secretKey, {
    global: { fetch: createSupabaseFetch(secretKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _client: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createSupabaseAdminClient();
    return Reflect.get(_client, prop, receiver);
  },
});
