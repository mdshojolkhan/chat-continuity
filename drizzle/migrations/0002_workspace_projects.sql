CREATE TABLE IF NOT EXISTS public.workspace_projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.workspace_projects TO service_role;
ALTER TABLE public.workspace_projects ENABLE ROW LEVEL SECURITY;
INSERT INTO public.workspace_projects (id, name) VALUES ('default', 'Default project') ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.workspace_files ADD COLUMN IF NOT EXISTS project_id text NOT NULL DEFAULT 'default';
ALTER TABLE public.workspace_files DROP CONSTRAINT IF EXISTS workspace_files_pkey;
ALTER TABLE public.workspace_files ADD CONSTRAINT workspace_files_pkey PRIMARY KEY (project_id, path);
NOTIFY pgrst, 'reload schema';