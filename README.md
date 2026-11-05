# Beinex Co-Create

An agent and workflow builder. Teams create AI agents with real tools (web search, deep research, page reading, calculator, JavaScript sandbox, knowledge search, documents), group them into councils, and chain them into workflows. Every external action (emails, approvals) waits for a person.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Pilot accounts

Pick an account on the sign-in screen, or use the email with the password `cocreate`.

| Account | Role | What they can do |
| --- | --- | --- |
| Mariam Khalid | Builder | Create agents, councils, workflows and knowledge |
| Fatima Al Mansoori | Approver | Sign off on gated runs |
| Omar Haddad | Security | Emergency pause, watchers, model access |
| Dr. Faisal Al Nuaimi | Auditor | Read-only runs and audit log |
| Pilot Admin | Admin | Users, keys and workspace settings |

## Models

The platform calls OpenRouter directly from the browser. Add a key under Settings → OpenRouter, or put it in a `.env` file as `VITE_OPENROUTER_API_KEY=...` (see `.env.example`). The key is stored only in the browser's local storage and sent only to OpenRouter.

Default model: `anthropic/claude-sonnet-5.5`. Profiles: Fast (Haiku 5.5), Balanced (Sonnet 5.5), Reasoning (Opus 5.5). Change them under Models.

## What is in the pilot

- Home: onboarding checklist, assistant prompt, items waiting for approval
- Chat: the assistant and your agents, with live tool calls shown inline
- Agents: create from a one-line description or a template; editor with instructions, AI refine, tools, knowledge, autonomy, watchers, MCP manifest and a live preview
- Councils: members, deliberation mode, gatekeeper, simulated deliberation with synthesis
- Workflows: canvas with seven bricks, copilot, step inspector, test runs that create Runs entries
- Tools: web search, deep research, read web page, calculator, run JavaScript, date/time, knowledge search, save document, draft email (gated), request approval (gated)
- Knowledge: libraries agents cite; agents can save documents back
- Runs: runs, approvals with sign-off, immutable audit log
- Models: Fast / Balanced / Reasoning profiles and the live OpenRouter catalog
- Settings: OpenRouter, users and roles, governance, notifications, workspace

The workspace starts empty. All data lives in the browser (local storage). Settings → Workspace → Reset clears it.
