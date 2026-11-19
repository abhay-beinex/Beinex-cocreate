# Contributing

## Flow

1. Pick or open an issue. Use the Bug or Feature template.
2. Branch from `main`: `fix/<short-name>` or `feat/<short-name>`.
3. Make the change. Keep a merge request to one concern.
4. Run `npm run build` (type-check + production build). It must pass.
5. Check the change in the browser, in light and dark themes if it touches UI.
6. Open a merge request to `main`, fill in the template, link the issue (`Closes #12`).

`main` should always build. CI runs the type-check and build on every push and merge request.

## Commits

Write the subject as a plain sentence about what changed, for example "Chat: keep the question when the first thread is created". Group related changes; avoid "WIP" commits in the final history.

## Things that must not land

- A real key or token anywhere in the repository, including `.env`, docs and test data.
- A release build path that reads `VITE_OPENROUTER_API_KEY`.
- Model provider names in user-facing text.
- An ability that acts outside the platform without waiting for a person (`isWriteTool` in `src/lib/tools.ts`).
- Raw HTML rendering of model output (`src/components/Md.tsx` must stay HTML-free).

## Where things go

See [docs/architecture.md](docs/architecture.md) for the map and [docs/development.md](docs/development.md) for step-by-step recipes.

## Docs

If your change alters behaviour a user sees, update [docs/features.md](docs/features.md) and [docs/user-guide.md](docs/user-guide.md). If it changes headers, environment variables or the proxy, update [SECURITY.md](SECURITY.md) and [docs/deployment.md](docs/deployment.md).
