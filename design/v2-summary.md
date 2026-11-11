# Co-Create v2: what changed and what was left out

Date: 2026-11-05. Base commit `b1a1fe3`. Research and concepts: `design/gap-list.md`, `design/v2-concepts.html`.

## Redesigned screens

- **Home** is an inbox and a pulse. One start line with an intent switch (Ask / Build an agent / Build a workflow) routes to Chat, Studio or the builder with the text carried over. "Needs you" lists approvals with inline Approve/Reject, failed runs with "Run again" from the failed step, and running runs with a live bar. "Last 14 days" shows run activity, failures, spend against the cap and a tabbed workspace list. First run shows a three-step setup card instead.
- **Chat** has threads: many per agent, grouped by day, searchable, renamable, deletable. The composer carries the agent pill (switch who answers), the thinking level and a file attach. Answers collect sources and offer Copy, Save as document and Turn into a workflow. Gated actions still queue under Approvals.
- **Studio** starts with a brief. Describe the agent, the Co-Create Assistant drafts name, description, icon, abilities, knowledge, thinking, independence, personality, instructions, sample prompts and three tests; everything is reviewed on one page with a live card and readiness ring; "Create" or "Create and run tests". Templates, import and "Build step by step" remain.
- **Workflow builder** is canvas-first: floating glass header and toolbar, a searchable palette (Steps, Abilities, Connectors, Flows), a floating inspector with a variable picker, "If it fails" and "Try this step", a run drawer with step lanes, a Variables tab and "Run again from here", and a docked 380px Co-Create Assistant that builds, extends, explains the last run and proposes changes as a plan you apply.

## Features added (all working against the real key, tested live)

- Variables and data mapping: every producing step stores `{{key}}`; input templates; `{{a.b.0}}` paths into JSON; loop variables; checks flag unknown variables.
- Repeat for each (loops) with Each/Done branches, items from a variable or extracted from the last result, results collected as a variable.
- Split (parallel branches) that run concurrently and join at the first shared step.
- Rule conditions (contains, equals, empty, greater/less than, regex) next to plain-language conditions.
- Run code (JavaScript sandbox over the variables) and Call an API (any method, headers, body, templates).
- Run a workflow as a step (child run recorded under Runs).
- Retries with back-off, timeouts, "if it fails: stop or continue".
- Re-run a finished run from any step (builder, Runs page, Home); try one step on its own with the last run's variables.
- Triggers: by link (`/run/<id>?input=…` while signed in), when a page changes (polled, hash-compared), when a document is added to a library.
- Agent tests: prompt plus expectation, real agent answer, model-judged pass/fail with reasons; "Write tests for me"; readiness counts them.
- Connector catalogue: twelve keyless public APIs added as abilities with one click, with Try buttons; usable by agents and as Action steps.
- Assistant panel with conversation, plan cards, approver resolution, insertion into existing chains, tolerant JSON parsing.
- Notifications only for approvals, failed runs and schedule problems; explicit Notify steps still notify. Removed: "scheduled run finished" and "approved/rejected" notifications.
- New templates: Compare in parallel, Process a list; Monitor and alert now uses a rule condition.

## Verified live

Parallel template (3 branches, join, variables), loop template (3 items, lanes, summary from collected results), approval pause and resume with a save-to-Knowledge step, re-run from the last step, assistant plan apply with insertion, Studio draft from a brief, three agent tests judged, connector Try calls, chat thread with answer actions, rule condition via Try this step. `tsc -b` and `vite build` are clean.

## Deliberately left out

- Inbound webhooks and email triggers: need a server to receive them; this build is browser-only. "By link" and "When a page changes" cover the demo cases.
- Workflow version history and diffs, structured-output schema editor, MCP tools, cross-session memory, voice, table/document modes, collaboration, environment secrets.
- Councils stay marked coming soon.
- Code splitting of the production bundle (one chunk over 500 kB; a warning, not an error).

## Known limits

- Approval steps cannot sit inside a Repeat or a Split (the checks say so).
- A workflow run as a step cannot pause for approval.
- Page watches and schedules fire only while the app is open in a browser.
- Connectors must allow browser requests; REST Countries was replaced by the World Bank API for that reason.

## Round 2 (same day): list pages, canvas feel, more steps

- Workflows list: always-visible "Start from" template strip with step chains, trigger tiles coloured by status, last-run status inline, waiting/failed chips, a "Needs you" filter, Pause/Resume in the row menu.
- Agents list: brief-first hero copy, "Blank" start, cards show tests pass rate, workflows using the agent and attached libraries.
- Canvas: drag a connection out and drop it on empty canvas to add the next step there; "+" on any connection inserts between; dropping a palette item on a connection inserts; double-click the canvas to add at that spot; Tab opens the palette; undo/redo (Ctrl+Z, Ctrl+Shift+Z) with toolbar buttons; Ctrl+D duplicates; snapping to connect within 36px; header fits narrow windows.
- New steps: Route by category (model picks one of your categories, one branch each), Wait, Set variables (templates, no model), Extract fields (JSON you can read as {{key.field}}). All reachable to the assistant and to "Try this step".

## Honest evaluation

What is genuinely good: the engine is real (loops, branches, variables, retries, re-runs all executed on the live key), the assistant proposes before it applies, and every new control was exercised in the browser at least once.

Where it is weaker than it looks:
- Visual QA was done mostly by reading page text because the preview pane was hidden; the four redesigns were screenshotted in a narrow 800px pane, not at a real desktop size. Spacing and wrapping at 1440px and in dark mode deserve a human pass.
- The browser-only architecture caps the product: no inbound webhooks or email, schedules and page watches run only while a tab is open, and connectors depend on third-party CORS. A thin server would unlock all of that.
- Assistant quality depends on a JSON contract with a general model; the parser is tolerant now, but a bad plan still needs a human to notice (for example a step placed on the wrong branch). Plans are not validated against the checks before Apply.
- Agent tests are judged by a model, so pass/fail has noise; drafted tests were too thin until the prompt was changed to include data. Treat the pass rate as a signal, not a gate.
- Parallel branches merge context in branch order and cannot pause for approval; loops run items sequentially (no concurrency); a workflow called as a step cannot wait for a person. These are documented limits, not bugs, but n8n and Dify handle more cases.
- No automated tests exist; correctness rests on typecheck plus manual runs. The engine would benefit from a small unit suite around template rendering, joins and re-run reconstruction.
- The production bundle is one 1 MB chunk; code splitting of the builder and chat routes was deliberately left out.
- Thread and run data live in local storage; large outputs will eventually hit its quota.

## Round 3: platform polish, seasonal touches, pressure check

- HIG-style polish: visible keyboard focus rings, themed selection colour, every scrollbar and native select styled to the theme (light and dark colour-scheme), reduced-motion respected (CSS and Framer Motion), no browser alert/confirm dialogs anywhere (themed Confirm dialogs and a bottom toast instead), Escape closes overlays, disabled controls show not-allowed.
- Themed cursor: one restrained macOS-style navy arrow with a hairline white edge, used for everything clickable; I-beam in text fields; grab on the canvas. Toggle under Settings › Workspace.
- Seasonal touches: a badge on the logo and a greeting on Home for Middle East, India and international holidays (Ramadan, both Eids, Hijri New Year, Nowruz, UAE Flag Day and National Day, Saudi, Qatar, Kuwait, Oman, Bahrain national days, Diwali, Onam, Lunar New Year, Christmas, New Year, Women's Day, Earth Day, Halloween). Lunar dates tabled 2025–2030. Toggle and a "Preview a holiday" selector under Settings › Workspace.
- Demo user renamed to Spencer (existing browsers migrate on load).
- Runs orphaned by a reload or closed tab are marked Failed with an "Interrupted" step and a notification, and can be run again from the last step.

Pressure check in Chrome: two runs of the same workflow started concurrently from the builder and the list completed independently (17s and 29s) with correct branching; reload mid-run now degrades cleanly; no console errors from the app; local storage at 15 KB after a dozen runs.

## Deployment readiness

Ready for a demo and a pilot behind a login, with these conditions:
- It is a browser-only build: schedules, page watches and link triggers only fire while a tab is open; nothing runs server-side. Do not promise unattended automation.
- The model key ships in the built JavaScript (VITE_OPENROUTER_API_KEY). For anything beyond a trusted pilot, put a proxy in front of the model API and keep the key there.
- Data lives in each browser's local storage: no sharing between people, no backup beyond Export under Settings.
- Sign-in is a demo-grade password check, not an identity provider.
- Add real unit tests around the engine before widening the audience.

## Round 4: themed dropdowns everywhere and a secure release path

- Every dropdown is now a themed component (`src/components/Dropdown.tsx`): same markup as a native select, keyboard navigation, type-to-search on long lists (Models), portal-positioned so it never clips. The Chat agent and thinking pills use it; the schedule time picker became hour and minute dropdowns.
- Security (see `SECURITY.md`): `server/proxy.mjs` serves `dist/` with CSP, HSTS, nosniff, frame-deny and proxies only the three model paths with the key held server-side, an origin check, a shared token, rate limit and body limit (probed locally: headers present, 401 without token, 404 off-allowlist, chat passthrough works). Passwords are salted SHA-256 (20k rounds) with rehash on first sign-in; sign-in throttles after five failures; sessions expire after 8 idle hours; the Run code sandbox has no network APIs (verified: fetch, XMLHttpRequest, importScripts, WebSocket all undefined).
- Build the release with `VITE_MODEL_API_BASE=/api/v1` and `VITE_PROXY_TOKEN`, never with `VITE_OPENROUTER_API_KEY`.
