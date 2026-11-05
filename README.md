# Beinex Co-Create

An agent and workflow builder. Teams create AI agents with real tools (web search, deep research, page reading, calculator, JavaScript sandbox, knowledge search, documents), group them into councils, and chain them into workflows. Every external action (emails, approvals) waits for a person.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Sign in

One demo account exists: `demo@beinex.com` / `cocreate` (admin). Add more users under Settings › Users; each gets an email, password and role (Builder, Approver, Security, Auditor, Admin).

## Models

Models are served through OpenRouter behind the scenes; the UI never mentions it. Put the key in `.env` as `VITE_OPENROUTER_API_KEY=...` (see `.env.example`), or an admin pastes it under Settings › Model access. Users pick models per agent and under Models (Fast / Balanced / Reasoning profiles).

## What is in the pilot

- Chat: the assistant and your agents with live tool calls shown inline; gated actions go to Approvals
- Agents: create from a one-line description or a template; editor with instructions, AI refine, tools (built-in and custom), knowledge, autonomy (enforced at runtime), version history with rollback, export/import, duplicate, live preview
- Councils: members, deliberation mode, gatekeeper, simulated deliberation with synthesis; usable as a workflow step
- Workflows: real engine. Trigger (manual with input, or schedule while the app is open), agent, council, condition (model-evaluated, yes/no branches), approval (pauses the run, resumes on approval), action (calls a tool), notify. Validation before publish; per-workflow run history
- Tools: web search, deep research, read web page, calculator, JavaScript sandbox, date/time, knowledge search, save document, draft email (gated), request approval (gated), plus custom HTTP tools with a test console
- Knowledge: libraries; add by pasting, uploading text files, or importing a URL
- Runs: runs with step outputs and cost, approvals that resume workflows, audit log
- Notifications: in-app bell for approvals, finished runs and schedules
- Governance: pause all schedules; daily spend caps per user and workspace enforced from real usage
- Settings: model access (admin), users with passwords and roles, workspace export/import/reset

The workspace starts empty. All data lives in the browser (local storage).
