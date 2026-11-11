# Securing a Co-Create release

Co-Create is a browser app. Everything below is what the code now does, and what the deployment must add.

## 1. Keep the model key off the client (required)

Never build with `VITE_OPENROUTER_API_KEY` for a release: anything in a Vite `VITE_` variable ships inside the JavaScript bundle.

Instead:

```bash
npm run build
OPENROUTER_API_KEY=sk-or-... ALLOWED_ORIGIN=https://cocreate.example.com PROXY_TOKEN=<long random string> node server/proxy.mjs
```

and build the app with `VITE_MODEL_API_BASE=/api/v1` and the same `VITE_PROXY_TOKEN`. The app then sends model calls to its own origin with no key; `server/proxy.mjs` adds the key, allows only the three OpenRouter paths the app uses, checks the token and origin, limits request size and rate per IP, and serves `dist/` with the security headers in section 3.

The proxy token is a shared secret in the bundle, so it only stops casual reuse of the endpoint; the origin check, rate limit and your sign-in in front of the app do the real work. Put the whole app behind your identity provider or network (see section 4).

## 2. What the code does now

- Passwords are stored as salted SHA-256 (20k rounds) in the browser's local storage; plain passwords from older installs are rehashed on first successful sign-in. Sign-in is throttled: five failures wait 30 seconds.
- Sessions expire after 8 hours without activity; the demo user signs out automatically.
- The JavaScript sandbox for "Run code" has no `fetch`, `XMLHttpRequest`, `WebSocket` or `importScripts`, runs in a worker, and is killed after 5 seconds.
- Markdown from models is rendered without raw HTML.
- Spend caps per user and workspace stop model calls when reached.
- Custom API abilities can hold API keys in headers. Those live in local storage of the person who created them and are included in workspace exports; treat exports as secrets.

## 3. Headers the host must send

`server/proxy.mjs` sends these; if you serve `dist/` from somewhere else, replicate them:

```
Content-Security-Policy: default-src 'self'; script-src 'self' blob:; worker-src blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https:; frame-ancestors 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`connect-src https:` is needed because people add their own HTTP abilities and connectors; tighten it to a list of hosts if your pilot does not use that feature.

## 4. Known limits of a browser-only pilot

- The user list, passwords, agents, workflows, runs and knowledge live in each browser's local storage. There is no shared database, no server-side audit and no backup beyond Settings › Export. Put the app behind your SSO or VPN so the URL alone grants nothing.
- Schedules, page watches and link triggers only run while a tab is open.
- Agents read the web; pages can contain prompt injection. External actions always wait for a person, which is the mitigation.

## 5. Checklist before go-live

- [ ] Built without `VITE_OPENROUTER_API_KEY`; `VITE_MODEL_API_BASE=/api/v1` and `VITE_PROXY_TOKEN` set
- [ ] `server/proxy.mjs` running with `ALLOWED_ORIGIN`, `PROXY_TOKEN`, behind HTTPS
- [ ] App reachable only after SSO/VPN
- [ ] Demo password changed under Settings › Users; extra users created with real emails
- [ ] Spend caps set under Settings › Governance
- [ ] Browser console shows no CSP violations on Home, Chat, builder and a workflow run
