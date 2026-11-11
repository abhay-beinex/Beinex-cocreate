// Co-Create release server: serves the built app with security headers and proxies model calls so the key never reaches the browser.
// Run: OPENROUTER_API_KEY=... node server/proxy.mjs   (after `npm run build`)
// Env: PORT (default 8080), OPENROUTER_API_KEY (required), ALLOWED_ORIGIN (default: same origin only), PROXY_TOKEN (optional shared secret
//      the app sends as X-Proxy-Token; set VITE_PROXY_TOKEN at build time to match), RATE_PER_MIN (default 60 per IP), MAX_BODY_KB (default 512).
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.PORT || 8080)
const KEY = process.env.OPENROUTER_API_KEY
const ORIGIN = process.env.ALLOWED_ORIGIN || ''
const TOKEN = process.env.PROXY_TOKEN || ''
const RATE = Number(process.env.RATE_PER_MIN || 60)
const MAX_BODY = Number(process.env.MAX_BODY_KB || 512) * 1024
const UPSTREAM = 'https://openrouter.ai/api/v1'
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (!KEY) { console.error('OPENROUTER_API_KEY is not set'); process.exit(1) }

const ALLOWED = [{ m: 'POST', p: '/api/v1/chat/completions' }, { m: 'GET', p: '/api/v1/models' }, { m: 'GET', p: '/api/v1/auth/key' }]
const CSP = ["default-src 'self'", "script-src 'self' blob:", "worker-src blob:", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com", "img-src 'self' data: https:", "connect-src 'self' https:", "frame-ancestors 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ')
const SECURITY = { 'Content-Security-Policy': CSP, 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin' }
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' }

const hits = new Map()
const limited = (ip) => { const now = Date.now(); const a = (hits.get(ip) ?? []).filter((t) => now - t < 60_000); a.push(now); hits.set(ip, a); return a.length > RATE }
const send = (res, status, body, extra = {}) => { res.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json', ...extra }); res.end(typeof body === 'string' ? body : JSON.stringify(body)) }
const readBody = (req) => new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy() } else chunks.push(c) }); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject) })

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'ip'
  if (url.pathname.startsWith('/api/')) {
    const origin = req.headers.origin
    if (ORIGIN && origin && origin !== ORIGIN) return send(res, 403, { error: { message: 'Origin not allowed' } })
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...SECURITY, 'Access-Control-Allow-Origin': ORIGIN || origin || '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Token, X-Title, HTTP-Referer', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }); return res.end() }
    if (TOKEN && req.headers['x-proxy-token'] !== TOKEN) return send(res, 401, { error: { message: 'Missing or wrong proxy token' } })
    if (!ALLOWED.some((a) => a.m === req.method && a.p === url.pathname)) return send(res, 404, { error: { message: 'Not proxied' } })
    if (limited(ip)) return send(res, 429, { error: { message: 'Too many requests, slow down' } })
    let body
    try { body = req.method === 'POST' ? await readBody(req) : undefined } catch { return send(res, 413, { error: { message: 'Request too large' } }) }
    try {
      const up = await fetch(UPSTREAM + url.pathname.replace('/api/v1', '') + url.search, { method: req.method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': ORIGIN || 'https://cocreate.local', 'X-Title': 'Beinex Co-Create' }, body })
      res.writeHead(up.status, { ...SECURITY, 'Content-Type': up.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': ORIGIN || origin } : {}) })
      if (!up.body) return res.end()
      for await (const chunk of up.body) res.write(chunk)
      return res.end()
    } catch (e) { return send(res, 502, { error: { message: `Upstream failed: ${e.message}` } }) }
  }
  // static app with SPA fallback
  let file = path.join(DIST, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''))
  if (!file.startsWith(DIST)) return send(res, 400, { error: { message: 'Bad path' } })
  try { const st = await stat(file); if (st.isDirectory()) file = path.join(file, 'index.html') } catch { file = path.join(DIST, 'index.html') }
  try {
    const ext = path.extname(file)
    const headers = { ...SECURITY, 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' }
    if (ext === '.html') { res.writeHead(200, headers); return res.end(await readFile(file)) }
    res.writeHead(200, headers); createReadStream(file).pipe(res)
  } catch { send(res, 404, { error: { message: 'Not found' } }) }
}).listen(PORT, () => console.log(`Co-Create serving ${DIST} on :${PORT}; model calls proxied to OpenRouter${TOKEN ? ' with a proxy token' : ''}${ORIGIN ? ` for ${ORIGIN}` : ''}`))
