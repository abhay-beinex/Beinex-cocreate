# Architecture

Co-Create is a single-page app. There is no backend apart from the optional release proxy; everything else runs in the browser.

```
+----------------------------- browser -----------------------------+
|  pages/ + components/  --reads/writes-->  store/app.ts (Zustand)  |
|        |                                       |  persisted to    |
|        | calls                                 v  localStorage    |
|        v                                  "cocreate-v3"           |
|  lib/runner.ts --> lib/engine.ts --> lib/agentRun.ts              |
|                         |                 |                       |
|                         v                 v                       |
|                    lib/tools.ts --> lib/openrouter.ts             |
+---------------------------------------------+---------------------+
                                              | HTTPS
        dev:      straight to the model API with VITE_OPENROUTER_API_KEY
        release:  same-origin /api/v1  -->  server/proxy.mjs  -->  model API
```

## Stack

React 18, TypeScript (strict), Vite 6, Tailwind CSS v4 (via `@tailwindcss/vite`, tokens in `src/index.css`), Zustand with `persist`, React Router 6, `@xyflow/react` for the workflow canvas, Framer Motion, `react-markdown` + `remark-gfm`, `lucide-react` icons. Imports use the `@/` alias for `src/`.

## State: `src/store/app.ts`

One Zustand store, `useApp`, holds everything: users and the session, agents, councils, workflows, runs, knowledge libraries, custom tools, chat threads and messages, notifications, spend entries, the audit log, model profiles, governance settings and UI preferences. Every mutation is an action on the store.

- **Persistence.** The `persist` middleware writes to local storage under the key `cocreate-v3`. `partialize` leaves out `models` (the fetched catalogue) and `flash` (the toast). `merge` runs on load and does the fix-ups: applies the env key, expires sessions older than `SESSION_HOURS`, makes sure the demo user exists.
- **No migrations.** There is no `migrate` function. When you add a field, give it a default in the initial state so older saved workspaces still load (`merge` spreads saved state over current defaults). Renaming or reshaping a field needs a fix-up in `merge`.
- **Permissions.** `can(user, action)` at the bottom of the file maps roles to `build`, `approve`, `security`, `admin`.
- **Spend.** `recordSpend` appends to `spend`; `canSpend` compares today's total to `caps.user` and `caps.org`. The engine asks `canSpend` before model calls.
- A few small UI preferences use their own local storage keys: `nav-collapsed`, `agents-view`, `builder-panel-v2`. Login throttling uses session storage (`login-gate`).

Types and template data live in `src/lib/data.ts` (`Agent`, `Workflow`, `WfNode`, `Run`, `RunStep`, `Library`, `CustomTool`, `agentTemplates`, `workflowTemplates`, `DEMO_USER`, `DEFAULT_MODEL`, `MODEL_PROFILES`).

## Model client: `src/lib/openrouter.ts`

An OpenAI-compatible client: `listModels`, `checkKey`, and `streamChat` (an async generator of stream events).

- `OR_BASE` is `VITE_MODEL_API_BASE` if set, otherwise the provider's public URL.
- `usingProxy` is true when `VITE_MODEL_API_BASE` is set. The store then holds the sentinel key `'proxy'` (`PROXY_KEY`) and the proxy token from `VITE_PROXY_TOKEN` is sent with each request; `apiHeaders` builds the headers for both modes.

## Agents: `src/lib/agentRun.ts`, `src/lib/tools.ts`, `src/lib/agentVocab.ts`

`runAgentTurn` is the agent loop: send messages plus tool definitions to `streamChat`, execute any tool calls with `runTool`, feed the results back, repeat until the model answers. It yields `RunEvent`s that Chat, Test drive, tests and the engine all consume.

`tools.ts` owns the abilities:

| Ability | How it works |
|---|---|
| `web_search`, `deep_research` | A model call with the provider's web plugin (`webAnswer`) |
| `read_url` | Fetches the page as text through the `r.jina.ai` reader |
| `calculate` | A restricted maths expression evaluator |
| `run_javascript` | A Web Worker built from a blob, without network APIs, killed after 5 s |
| `current_datetime` | Local clock |
| `search_knowledge` | Search over the libraries in the store |
| `save_document` | Writes to the `outputs` library |
| `draft_email`, `request_approval` | Gated (`isWriteTool`): they wait for a person instead of acting |
| custom tools and connectors | `customToolDef` turns a `CustomTool` (an HTTP request description) into a tool; `connectors.ts` is a catalogue of ready-made ones |

`agentVocab.ts` is the UI vocabulary for agents: ability labels and icons, thinking levels, autonomy levels, tones, and the `readiness` checklist. `evals.ts` runs agent tests (`runTest`) and drafts them (`draftTests`).

## Workflows: `src/lib/flow.ts`, `src/lib/engine.ts`, `src/lib/runner.ts`, `src/lib/template.ts`

A workflow is a graph: `WfNode[]` and `WfEdge[]`. Each node has a `brick` (step type) and `StepData`.

- **`flow.ts`** is the static side. `BRICKS` is the registry of step types. It also has graph helpers (`nextOf`, `outEdges`, `joinOf`, `nestedNodes`), `autoLayout`, `newStep`, `checkFlow` (the validation behind the builder's problem list) and `varsBefore` (which variables a step can see).
- **`engine.ts`** is the interpreter. `execute` walks the graph from the Start node, one step at a time, and dispatches on the step's `brick`. It handles variables, retries with back-off, timeouts, "on failure stop or continue", loops (`loop`), parallel branches (`parallel`, joined at `joinOf`), conditions (`logic`, `classify`), and pauses at `human` steps. It has no knowledge of the app: everything it needs comes in through `EngineCtx`, and it reports progress through `ctx.onUpdate(run)`.
- **`runner.ts`** wires the engine to the store. `startRun`, `resumeRun` (after an approval), `rerunFrom`, `tryStep`, plus the triggers: `tickSchedules` (called every 60 s from `Shell.tsx`), `checkWatch` (page changes) and `watchDocuments`. `reconcileRuns` deals with runs left "running" by a closed tab when the app loads.
- **`template.ts`** renders `{{variable}}` templates, including paths like `{{a.b.0}}`. `json.ts` parses model output that is nearly JSON.

Step type ids and their names in the UI:

| `brick` | UI name | `brick` | UI name |
|---|---|---|---|
| `trigger` | Start | `loop` | Repeat for each |
| `agent` | Agent | `parallel` | Split |
| `council` | Council (coming soon) | `flow` | Run a workflow |
| `tool` | Action | `code` | Run code |
| `logic` | Condition | `http` | Call an API |
| `human` | Approval | `wait`, `set` | Wait, Set |
| `notify` | Notify | `extract`, `classify` | Extract, Route |

`BRICKS` in `flow.ts` is the source of truth if this table drifts.

## UI: `src/pages/`, `src/components/`

`main.tsx` defines the routes; every signed-in route renders inside `components/Shell.tsx` (navigation, notifications, session timeout, the schedule ticker).

| Route | File |
|---|---|
| `/login` | `pages/Login.tsx` |
| `/` | `pages/Home.tsx` |
| `/chat`, `/chat/:agentId` | `pages/Chat.tsx` + `components/ChatThread.tsx` |
| `/agents` | `pages/Agents.tsx` |
| `/agents/new` | `pages/AgentStudio.tsx` |
| `/agents/:agentId` | `pages/AgentEditor.tsx` |
| `/workflows` | `pages/Workflows.tsx` |
| `/workflows/:workflowId` | `pages/WorkflowEditor.tsx` + `components/FlowNodes.tsx` |
| `/tools`, `/knowledge`, `/runs`, `/models`, `/settings` | the page of the same name |
| `/run/:workflowId` | `pages/RunLink.tsx` (the "by link" trigger) |

`components/ui.tsx` has the shared primitives, `Dropdown.tsx` the themed select, `Md.tsx` the markdown renderer (no raw HTML), `motion.tsx` the shared animations.

`pages/WorkflowEditor.tsx` is by far the largest file (canvas, palette, inspector, run drawer and the assistant panel in one, about 119 KB). It is the first candidate for splitting up.

## Release path: `server/proxy.mjs`, `Dockerfile`

`proxy.mjs` is a dependency-free Node HTTP server. It serves `dist/` with the security headers, falls back to `index.html` for client routes, and proxies exactly three paths (`POST /api/v1/chat/completions`, `GET /api/v1/models`, `GET /api/v1/auth/key`) to the model API with the server-side key. It checks `Origin` and `X-Proxy-Token`, caps body size and rate-limits per IP in memory.

The `Dockerfile` builds with `VITE_MODEL_API_BASE=/api/v1` and an empty `VITE_OPENROUTER_API_KEY`, fails if `sk-or-` appears in `dist/`, and runs the proxy as the `node` user on port 8080. See [deployment.md](deployment.md) and [../SECURITY.md](../SECURITY.md).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_OPENROUTER_API_KEY` | build time, dev only | Calls the model API straight from the browser. Never set for a release |
| `VITE_MODEL_API_BASE` | build time, release | Set to `/api/v1` so calls go to the proxy |
| `VITE_PROXY_TOKEN` | build time, release | Sent as `X-Proxy-Token`; must equal `PROXY_TOKEN` |
| `OPENROUTER_API_KEY` | proxy runtime | The real key. Required |
| `PROXY_TOKEN` | proxy runtime | Shared secret checked on `/api/*` |
| `ALLOWED_ORIGIN` | proxy runtime | Only this `Origin` may call `/api/*` |
| `RATE_PER_MIN`, `MAX_BODY_KB`, `PORT` | proxy runtime | Defaults 60, 512, 8080 |
