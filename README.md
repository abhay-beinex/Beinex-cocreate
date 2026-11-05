# Beinex Co-Create

Governed AI agent and workflow platform for the Beinex pilot. Non-technical staff create specialised assistants ("agents"), committees of agents ("councils") and multi-step workflows. Anything that changes company data waits for a human to approve.

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

Default model: `anthropic/claude-sonnet-5.5`. Profiles: Verify (Sonnet 5.5), Decide (Opus 5.5), Draft (Haiku 5.5). Change them under Models.

## What is in the pilot

- Home: role-aware briefing, prompt box, attention list, deadlines
- Chat: assistant and agents with real tool calling over pilot data; write tools are queued for approval
- Agents: editor with instructions, AI refine, tools, knowledge, autonomy, watchers, MCP manifest, live preview
- Councils: members, deliberation mode, gatekeeper, simulated deliberation with synthesis
- Workflows: canvas with seven bricks, copilot, step inspector, test runs that create Runs entries
- Tools and Knowledge: built-in tools, connectors, document libraries agents cite
- Runs: runs, approvals with sign-off, immutable audit log
- Models: profiles and the live OpenRouter catalog
- Settings: OpenRouter, users and roles, governance, notifications, workspace

All pilot data lives in the browser (local storage). Settings → Workspace → Reset restores the seed data.
