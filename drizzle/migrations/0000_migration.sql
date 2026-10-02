CREATE TABLE public.workspace_files (
  path text PRIMARY KEY,
  content text NOT NULL DEFAULT '',
  bytes integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_files TO service_role;
ALTER TABLE public.workspace_files ENABLE ROW LEVEL SECURITY;
-- No policies: only server-side code (service role) may read or write.