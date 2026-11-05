# Beinex Co-Create

An agent and workflow builder. Teams create AI agents with real abilities (web search, deep research, page reading, calculator, JavaScript sandbox, knowledge search, documents, public API connectors) and chain them into workflows with loops, parallel branches, conditions, code and API steps. Every external action (emails, approvals) waits for a person.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Sign in

One demo account exists: `demo@beinex.com` / `cocreate` (admin, shown as Spencer). Add more users under Settings › Users; each gets an email, password and role (Builder, Approver, Security, Auditor, Admin).

## Models

Models are served through OpenRouter behind the scenes; the UI never mentions it. Put the key in `.env` as `VITE_OPENROUTER_API_KEY=...` (see `.env.example`). There is no key UI; users only pick models per agent and under Models (Fast / Balanced / Reasoning profiles).

## What is in the product

- Home: an inbox and a pulse. One line to ask, build an agent or build a workflow; approvals, failed runs and running runs with inline actions; 14-day activity and spend; agents, workflows and recent runs at a glance
- Chat: threads (many per agent) with search, rename and delete; switch the agent and thinking level per thread; attach text files as context; copy, save an answer as a document or turn it into a workflow; sources collected under answers; gated actions go to Approvals
- Agents: brief-first Studio (describe it, the Co-Create Assistant drafts name, abilities, behaviour, instructions, sample prompts and tests; review on one page; create), templates, agent page with Abilities, Behaviour, Knowledge, Instructions, Tests and Versions, readiness checklist, Test drive, export/import, duplicate
- Tests: a prompt plus what a good answer must do; the agent answers for real and a model judges pass/fail with a reason; "Write tests for me"
- Workflows: canvas-first builder with a searchable palette (steps, abilities, connectors, other workflows), floating inspector, run drawer (steps, lanes, variables, run again from a step) and a docked Co-Create Assistant that builds, extends, explains and proposes changes you apply
- Steps: Start, Agent, Approval, Action, Notify, Condition (plain-language or rule), Repeat for each (loops with Each/Done), Split (parallel branches that join), Run a workflow, Run code (JavaScript sandbox), Call an API
- Variables: every step stores its result as `{{key}}`; steps can take an input template with `{{a.b.0}}` paths into JSON; `{{item}}`, `{{index}}`, `{{count}}` inside loops; a variable picker in the inspector
- Triggers: by hand, on a schedule, by link (`/run/<id>?input=…`), when a page changes (polled while the app is open), when a document is added to a library
- Reliability: retries with back-off, timeouts, "if it fails: stop or continue", re-run a finished run from any step, try one step on its own with the last run's variables
- Abilities: web search, deep research, read web page, calculator, JavaScript sandbox, date/time, knowledge search, save document, draft email (gated), request approval (gated), your own HTTP APIs, and a connector catalogue of keyless public APIs (weather, places, exchange rates, crypto prices, country facts, Wikipedia, dictionary, books, public holidays, Hacker News, GitHub, postcodes)
- Knowledge: libraries; add by pasting, uploading text files, or importing a URL
- Runs: runs with step outputs, lanes for loops and branches, variables, cost; approvals that resume workflows; audit log
- Notifications: only for things a person must act on (approvals, failed runs, schedule problems); explicit Notify steps still notify
- Governance: pause all schedules; daily spend caps per user and workspace enforced from real usage
- Settings: users with passwords and roles, governance, workspace export/import/reset

Inbound webhooks and email triggers need a server and are not part of this browser-only build. Councils are marked coming soon.

The workspace starts empty. All data lives in the browser (local storage).
