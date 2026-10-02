# V1 Core Architecture

V1 Agent's secure foundation. This phase deliberately excludes Android/device
control and self-modifying code.

## Layout

```
src/lib/v1/
  types.ts                  Client-safe contracts + Zod schemas
  client.ts                 Browser HTTP client for the V1 API
  http.server.ts            JSON helpers, body limits, error mapping
  core/orchestrator.server.ts  V1 Core: intent -> skills -> memory -> engine
  model-engine/
    engine.ts               ModelEngine interface + ModelEngineError
    lovable.server.ts       Cloud engine (Lovable AI Gateway)
    local.server.ts         Deterministic offline fallback
    index.server.ts         Engine selection
  memory/
    store.ts                ShortTermMemory / LongTermMemory interfaces
    index.server.ts         In-process default implementation
  tools/
    registry.ts             Skill registry, validation, approval gate
    builtin.server.ts       Built-in safe skills
  security/permissions.ts   Permission catalogue + boundaries
src/routes/api/chat.ts      POST /api/chat
src/routes/api/v1/*.ts      GET status, GET tools, POST tools/execute
```

## 1. Orchestrator

`handleChatTurn(request)` is the single entry point for a user turn:

1. classify intent (`smalltalk | question | task | tool | unsafe`);
2. refuse immediately on `unsafe` — no model call, no skill;
3. optionally run one no-approval skill and attach its result;
4. assemble the system prompt from base rules + mode + long-term memory;
5. call the selected `ModelEngine`;
6. return `{ message, provider, model, intent, conversationId, toolsUsed }`.

The orchestrator never talks to a vendor SDK and never evaluates user input.

## 2. Model Engine

```ts
interface ModelEngine {
  provider: string;
  model: string;
  isConfigured(): boolean;
  generate(input): Promise<{ text: string }>;
}
```

`index.server.ts` picks the cloud engine when `LOVABLE_API_KEY` is present and
falls back to the local engine otherwise, so the app never hard-fails. Add a new
provider by implementing the interface and registering it there — nothing else
changes.

## 3. V1 API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/chat` | One assistant turn |
| GET | `/api/v1/status` | Engine + skill-count health |
| GET | `/api/v1/tools` | Skill metadata for the UI |
| POST | `/api/v1/tools/execute` | Run one skill with explicit approval |

Every body is Zod-validated, capped at 64 KB, and errors are mapped to stable
codes (`invalid_request`, `rate_limited`, `payment_required`, `forbidden`,
`model_unavailable`, `internal_error`). Internal messages are never leaked.

## 4. Memory

- **Short-term**: last N turns per `conversationId`, used to build the model
  context.
- **Long-term**: explicit, user-saved notes (`remember` / `forget` / `list`).

Both are interfaces. The default implementation is in-process; swap it for a
database-backed one without touching the orchestrator.

## 5. Skills

A skill declares `id`, `name`, `description`, `permissions`,
`requiresApproval` and a Zod `inputSchema`. The registry validates input,
checks permissions and enforces the approval gate before `execute` runs.
Built-ins: `current_time`, `analyze_text`, `draft_android_permission_plan`.

## 6. Security

- Secrets live only in environment variables, read inside server handlers.
- `security/permissions.ts` grants only `read:time`, `read:conversation`,
  `write:memory`. `net:fetch`, `device:control` and `system:exec` are
  hard-denied in this phase and cannot be granted at runtime.
- Prompt-injection guard: message text is treated as content, never as
  instructions; unsafe patterns are refused before any model call.
- No code execution, no filesystem access, no device access.

## 7. UI

The existing UI is preserved: `/` is the chat surface (with companion /
programming / developer modes) and `/settings` shows engine status, permission
boundaries and skills. The browser only ever calls our own API routes.

## Extending

- **New provider** → implement `ModelEngine`, register in `index.server.ts`.
- **New skill** → add to `tools/builtin.server.ts` with the narrowest
  permissions and `requiresApproval: true` for anything with side effects.
- **Persistent memory** → reimplement `LongTermMemory` behind the same
  interface.
- **Device control (future phase)** → add the permission, keep it denied by
  default, and require per-action approval.
