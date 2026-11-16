# Beinex Co-Create

An agent and workflow builder. Teams create AI agents with real abilities (web search, deep research, page reading, calculator, JavaScript sandbox, knowledge search, documents, HTTP connectors) and chain them into workflows with loops, parallel branches, conditions, code and API steps. Anything that leaves the platform (an email, an approval) waits for a person.

It is a browser app: React + TypeScript + Vite, state in the browser's local storage, model calls through OpenRouter. A small Node server (`server/proxy.mjs`) serves the release build and keeps the model key off the client.

## Quick start

Needs Node 20 or newer.

```bash
npm install
cp .env.example .env        # then put a model key in VITE_OPENROUTER_API_KEY
npm run dev                 # http://localhost:5173
```

Sign in with the demo account `demo@beinex.com` / `cocreate` (admin). The workspace starts empty; create an agent under **Agents › New** to check that model calls work.

Without a key the app still starts and you can sign in and browse; anything that calls a model will fail.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload on port 5173 |
| `npm run typecheck` | TypeScript check only (`tsc -b`) |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve `dist/` with Vite (no proxy, no security headers) |
| `npm run serve` | Run the release server: `dist/` + model proxy. Needs `OPENROUTER_API_KEY` |

There is no test runner or linter yet. `npm run build` is the gate CI runs.

## Repository layout

```
src/
  main.tsx          routes
  store/app.ts      the single Zustand store (all state, persisted to local storage)
  lib/              logic with no UI: engine, runner, tools, model client, auth, data types
  pages/            one file per screen
  components/       shared UI (shell, chat thread, canvas nodes, dropdowns, primitives)
  index.css         Tailwind v4 theme and global styles
server/proxy.mjs    release server: static files, security headers, model proxy
public/             static assets
docs/               everything in the table below
Dockerfile          release image (build + proxy)
.gitlab-ci.yml      type-check and build on every push and merge request
.gitlab/            issue and merge request templates
```

## Documentation

| Read this | When you want to |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Understand how the pieces fit: store, engine, tools, model client, proxy |
| [docs/development.md](docs/development.md) | Add a step type, an ability, a connector, a page or a store field |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Go from a symptom to the file that causes it |
| [docs/features.md](docs/features.md) | See everything the product does |
| [docs/user-guide.md](docs/user-guide.md) | Use the product (written for the pilot team) |
| [docs/deployment.md](docs/deployment.md) | Release to Azure Container Apps, roll back, rotate the key |
| [SECURITY.md](SECURITY.md) | Know what a release must do to keep the key and users safe |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branch, commit and open a merge request |
| [docs/design/](docs/design/) | Design concepts and the v2 gap analysis (historical) |

## Known limits

- All data is per browser (local storage). No shared database, no server-side audit.
- No single sign-on. Users and salted password hashes live in the browser.
- Schedules, page watches and document triggers only fire while a tab is open.
- Inbound webhooks and email triggers need a backend and are not built.
- No automated tests.

## Two rules that matter

1. Never commit `.env`, and never build a release with `VITE_OPENROUTER_API_KEY` set. Vite inlines every `VITE_` variable into the JavaScript bundle. See [SECURITY.md](SECURITY.md).
2. The UI never names the model provider. Keep it that way in labels, errors and toasts.
