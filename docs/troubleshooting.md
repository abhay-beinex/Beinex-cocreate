# Troubleshooting

Symptom first, then the likely cause and the file to open.

## Setup and build

| Symptom | Cause and fix |
|---|---|
| Every model call fails right after `npm install` | No key. Put `VITE_OPENROUTER_API_KEY` in `.env` and restart `npm run dev` (Vite reads `.env` only at start-up) |
| Key changed in `.env` but the old one is still used | A key already saved in local storage is kept; the env key only fills an empty one. Reset the workspace (Settings › Reset) or clear `cocreate-v3`. Logic: `merge` in `src/store/app.ts` |
| `npm run build` fails on types but `npm run dev` works | Vite does not type-check in dev. Run `npm run typecheck` and fix what it lists |
| Stale type errors that do not match the code | Delete `tsconfig.tsbuildinfo` and run again |
| Port 5173 in use | Another dev server is running. Stop it or change `server.port` in `vite.config.ts` |
| Docker build stops with "Model key found in bundle" | A key reached the build. Check that `.env` is not in the build context (`.dockerignore`) and that `VITE_OPENROUTER_API_KEY` is not passed as a build arg |

## Sign-in and sessions

| Symptom | Cause and fix |
|---|---|
| Demo login rejected | The demo password was changed in this browser, or sign-in is throttled (five failures wait 30 s). `src/lib/auth.ts`, `src/pages/Login.tsx` |
| "My users disappeared" on another machine | Users live in each browser's local storage. Expected; see Known limits in the README |
| Signed out unexpectedly | Sessions end after 8 hours idle (`SESSION_HOURS` in `src/lib/auth.ts`; the timer is in `src/components/Shell.tsx`) |

## Agents and chat

| Symptom | Where to look |
|---|---|
| Answer stops mid-stream or tool calls are malformed | `streamChat` in `src/lib/openrouter.ts` (stream parsing), then the loop in `src/lib/agentRun.ts` |
| Agent never uses an ability | Is it enabled on the agent? Then check its definition in `TOOLS` (`src/lib/tools.ts`); a vague `description` is the usual reason |
| "Web search is not available right now" | No key in the store. If the key is there and search still fails, the model call with the web plugin is failing: `webAnswer` in `src/lib/tools.ts` |
| `read_url` returns "Could not read the page" | The reader service (`r.jina.ai`) failed or the site blocks it. `runTool`, case `read_url` |
| Run JavaScript times out or cannot fetch | By design: 5 s limit and no network in the sandbox. `run_javascript` in `src/lib/tools.ts` |
| Custom API ability fails with a network error | Usually CORS. The call is made from the browser, so the API must allow the app's origin |
| Calls stop because of spend | Daily cap reached. Settings › Governance; logic in `canSpend` in `src/store/app.ts` |
| Test passes or fails oddly | The judge is a model. Prompt and parsing in `src/lib/evals.ts` |

## Workflows

| Symptom | Where to look |
|---|---|
| Run stuck on "running" after a reload | A closed tab cannot finish a run. `reconcileRuns` in `src/lib/runner.ts` handles these on load; if one slips through, that is the function to fix |
| Run paused and never resumes | It is waiting at an Approval. Approve under Runs › Approvals; the resume path is `resumeRun` in `src/lib/runner.ts` |
| `{{variable}}` shows up literally in output | The key does not match a step's key, or the step is not upstream. `render` in `src/lib/template.ts`, `varsBefore` in `src/lib/flow.ts` |
| Loop runs zero times | The list could not be read from the input. `toList` in `src/lib/template.ts` and the `loop` branch in `src/lib/engine.ts` |
| Split never joins | Branches do not meet at a shared step. `joinOf` in `src/lib/flow.ts` |
| Condition takes the wrong branch | Rule mode is evaluated in the `logic` branch of the engine. Plain-language mode is a model judgement |
| Builder shows a problem | `checkFlow` in `src/lib/flow.ts` has every rule |
| Schedule did not fire | No tab was open, schedules are paused, or the spend cap is reached. `isDue` in `src/lib/engine.ts`, `tickSchedules` in `src/lib/runner.ts` |
| Page-change trigger fires every time | The page has changing content (timestamps, ads), so its hash changes. `textHash` in `src/lib/engine.ts`, `checkWatch` in `src/lib/runner.ts` |
| Canvas layout or panel problems | `src/pages/WorkflowEditor.tsx`; node rendering in `src/components/FlowNodes.tsx`; `autoLayout` in `src/lib/flow.ts` |

## Release

| Symptom | Cause and fix |
|---|---|
| `/api/v1/...` returns 401 | `VITE_PROXY_TOKEN` at build time does not equal `PROXY_TOKEN` at runtime |
| `/api/v1/...` returns 403 | `ALLOWED_ORIGIN` does not match the URL in the browser (scheme, host, no trailing slash) |
| `/api/v1/...` returns 404 "Not proxied" | The app called a path outside the allow-list. Add it to `ALLOWED` in `server/proxy.mjs` only if it is really needed |
| 429 for a whole office | The rate limit is per IP and offices share one. Raise `RATE_PER_MIN` |
| Blank page with CSP errors in the console | A new external script, font or frame is blocked. Adjust `CSP` in `server/proxy.mjs` and the copy in `SECURITY.md` |
| Proxy exits at start | `OPENROUTER_API_KEY` is not set |

## Reporting an issue

Use the Bug template when you open an issue. The useful facts are: the route you were on, what you did, what you expected, the browser console output, and for workflow problems the run id from Runs.
