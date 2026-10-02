GRANT ALL ON public.workspace_files TO service_role;
ALTER TABLE public.workspace_files ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';