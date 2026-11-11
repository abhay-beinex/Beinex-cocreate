# Deploying Co-Create to Azure

Live: https://beinex-co-create.happyflower-19a0f2b7.uaenorth.azurecontainerapps.io

| Piece | Value |
|---|---|
| Subscription / tenant | Azure subscription 1 / Beinex Solutions |
| Resource group | `AI_Labs` (UAE North) |
| Registry | `beinexailabs.azurecr.io`, repository `cocreate`, tags `YYYYMMDD-HHMM-<git sha>` |
| Container App | `beinex-co-create` in environment `managedEnvironment-AILabs-86c8` (Consumption) |
| Size | 0.5 vCPU, 1 GiB, 1–3 replicas (min 1 so the app never cold-starts) |
| Ingress | external, HTTPS only (HTTP redirects), target port 8080 |

The image runs `server/proxy.mjs` (see [SECURITY.md](SECURITY.md)): it serves `dist/` with the security headers and proxies the three model endpoints, holding the key server-side.

## Configuration (Container App)

| Env var | Source |
|---|---|
| `OPENROUTER_API_KEY` | secret `openrouter-key` |
| `PROXY_TOKEN` | secret `proxy-token`; must equal the `VITE_PROXY_TOKEN` build arg |
| `ALLOWED_ORIGIN` | `https://beinex-co-create.happyflower-19a0f2b7.uaenorth.azurecontainerapps.io` (change if a custom domain is added) |
| `RATE_PER_MIN` | `120` per IP |

The image pulls with the registry's admin credentials (secret `beinexailabsazurecrio-beinexailabs`), like the other AI Labs apps. The app also has a system-assigned identity; once someone with Owner/User Access Administrator grants it `AcrPull` on `beinexailabs`, switch with `az containerapp registry set ... --identity system` and drop the password secret.

## Release a new version

```bash
TOKEN=$(az containerapp secret show -g AI_Labs -n beinex-co-create --secret-name proxy-token --query value -o tsv)
TAG=$(date +%Y%m%d-%H%M)-$(git rev-parse --short HEAD)
az acr login -n beinexailabs
docker build --build-arg VITE_PROXY_TOKEN="$TOKEN" -t beinexailabs.azurecr.io/cocreate:$TAG .
docker push beinexailabs.azurecr.io/cocreate:$TAG
az containerapp update -g AI_Labs -n beinex-co-create --image beinexailabs.azurecr.io/cocreate:$TAG
```

The Dockerfile builds with `VITE_MODEL_API_BASE=/api/v1`, blanks `VITE_OPENROUTER_API_KEY`, and fails the build if `sk-or-` appears anywhere in `dist/`. `.dockerignore` keeps `.env` out of the build context.

Rollback: `az containerapp update -g AI_Labs -n beinex-co-create --image beinexailabs.azurecr.io/cocreate:<previous tag>`.

Rotate the model key: `az containerapp secret set -g AI_Labs -n beinex-co-create --secrets openrouter-key=<new>` then `az containerapp revision restart`.

## Sanity checks (run after each release)

- `/`, `/workflows`, `/agents` return 200; `http://` redirects to `https://`
- Response has `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `/api/v1/models` without token → 401; wrong `Origin` → 403; `/api/v1/credits` → 404; with token and own origin → 200
- A short chat completion through `/api/v1/chat/completions` returns text
- The main JS bundle has no `sk-or-`
- Login page loads with no console or CSP errors

## Still open before a wider roll-out

- **No SSO yet.** The URL is public; anyone can reach the login page, and the proxy token is in the bundle. Add Entra sign-in (Container Apps authentication) or IP restrictions before sharing beyond the pilot group.
- **Set a spending limit on the model key** at the provider; it currently has none.
- Data still lives in each browser (SECURITY.md §4); schedules only run while a tab is open.
- Change the demo password under Settings › Users and set spend caps under Settings › Governance.
