# Development guide

Read [architecture.md](architecture.md) first; this page is the "how do I change X" companion.

## Setup

```bash
npm install
cp .env.example .env     # set VITE_OPENROUTER_API_KEY
npm run dev
```

Node 20+ (`.nvmrc`). Restart `npm run dev` after editing `.env`; Vite reads it at start-up.

Before pushing:

```bash
npm run build
```

That runs the type-check and the production build, the same two things CI runs.

## Try the release path locally

```bash
VITE_MODEL_API_BASE=/api/v1 VITE_PROXY_TOKEN=local-token VITE_OPENROUTER_API_KEY= npm run build
OPENROUTER_API_KEY=<key> PROXY_TOKEN=local-token ALLOWED_ORIGIN=http://localhost:8080 npm run serve
```

Open http://localhost:8080. Or build the image: `docker build --build-arg VITE_PROXY_TOKEN=local-token -t cocreate .`

(These are bash lines. In PowerShell set the variables with `$env:NAME = 'value'` first.)

## Working with local data

Everything is in local storage under `cocreate-v3`.

- **Reset:** Settings › Reset, or run `localStorage.removeItem('cocreate-v3')` in the console and reload.
- **Inspect:** `JSON.parse(localStorage.getItem('cocreate-v3')).state` in the console.
- **Share a repro:** Settings › Export gives a JSON file a colleague can Import. Exports contain any API keys saved in custom tools, so do not attach them to issues without checking.
- A second browser profile or a private window gives you a clean workspace next to your own.

## Recipes

### Add an ability (a tool agents can call)

1. `src/lib/tools.ts`: add the function definition to `TOOLS` and a `case` in `runTool`. If it acts outside the platform, make `isWriteTool` cover it so it waits for a person.
2. `src/lib/agentVocab.ts`: add it to `abilities` (label, description, icon, category, `gated`).
3. If workflow steps should have it by default, add it to `DEFAULT_STEP_TOOLS` in `src/lib/engine.ts`.

### Add a connector (a ready-made public API)

Add an entry to `CONNECTORS` in `src/lib/connectors.ts`. It becomes a `CustomTool` when the user adds it from Tools. The release CSP allows `connect-src https:`, so no header change is needed, but the API must send CORS headers because the call is made from the browser.

### Add a workflow step type

1. `src/lib/data.ts`: add the id to the `Brick` type and any new fields to `StepData`.
2. `src/lib/flow.ts`: add it to `BRICKS`; update `producesVar`, `branchesOf` and `checkFlow` if it stores a result, has more than one exit, or needs validation.
3. `src/lib/engine.ts`: handle it in the step dispatch (search for `brick === '`), and in `runStepOnce` if "Try this step" should support it.
4. `src/pages/WorkflowEditor.tsx`: add its fields to the inspector. `src/components/FlowNodes.tsx` renders the node on the canvas.

### Add a page

Create `src/pages/Thing.tsx`, add the route in `src/main.tsx`, and add the navigation entry in `src/components/Shell.tsx`.

### Add state

Add the field and its default to the store in `src/store/app.ts`, plus the actions that change it. Saved workspaces from before your change will not have the field; the default covers that because `merge` spreads saved state over current defaults. If you rename or reshape an existing field, convert the old shape in `merge`. If the field should not be saved, add it to the exclusion list in `partialize`.

### Change the default models

`DEFAULT_MODEL` and `MODEL_PROFILES` in `src/lib/data.ts`; fallbacks in `profileModels` at the bottom of `src/store/app.ts`.

### Change the theme

Theme tokens live in `src/index.css`. Use the tokens, not literal colours, so light and dark both keep working.

## Conventions

- TypeScript strict. No `any` in new code unless you are at a real boundary (model JSON, `import.meta.env`).
- Logic goes in `src/lib/` and takes its dependencies as arguments (see `EngineCtx`, `ToolContext`); pages and the runner connect it to the store. Keep `engine.ts` and `tools.ts` free of React and of direct store access.
- All shared state goes through `useApp`. Select narrowly (`useApp((s) => s.agents)`) to avoid re-rendering on every store change.
- UI copy: plain language, no provider names, no internal ids. External actions are always gated behind a person.
- Many existing files use long single-line statements. New code should use normal line lengths; reformat old code only in a merge request of its own so reviews stay readable.

## Debugging

- **Model calls:** browser dev tools › Network, filter `chat/completions`. The response is a stream; provider errors arrive as JSON with `error.message`.
- **A run:** every run is in the store's `runs` with its steps. The run drawer in the builder and the Runs page show the same data.
- **Store from the console:** in dev, add `;(window as any).app = useApp` temporarily at the end of `src/store/app.ts`, then use `app.getState()`.
- **Schedules:** `tickSchedules` runs once a minute from `Shell.tsx`, only while a tab is open and schedules are not paused in Settings › Governance.
