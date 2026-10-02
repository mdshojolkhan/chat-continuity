<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI providers are defined once in `src/lib/v1/providers/registry.ts` and served through `/api/v1/providers`; keys live only server-side (store, falling back to project secrets) so the browser never receives them.
- AI roles (admin/helper/user) are enforced in `ToolRegistry.run` via `assertRolePermissions`; a missing role defaults to "helper" so workspace writes always need an explicit server-decided admin or user context.
- Chat's AI role is resolved server-side in `resolveChatEngine`; the client may pick a provider but never its role. With no Admin AI selected, the built-in engine acts as admin so the App Builder keeps working.
- Workspace files persist in the Lovable Cloud table `public.workspace_files` (RLS on, no policies), accessed only server-side via the service-role client in `src/lib/v1/files/index.server.ts`; never expose it to the browser or store API keys there.
- Chat message Markdown and clipboard controls live in the existing V1 chat view and its presentation helper, so message content remains the single source of truth for display, copying, and revisions.
