// Password hashing for the browser-held user list: SHA-256 with a per-user random salt, 20k rounds. Stored as "sha256:<salt>:<hash>".
const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('')

export const isHashed = (s: string) => s.startsWith('sha256:')

export async function hashPassword(password: string, salt?: string): Promise<string> {
  const s = salt ?? hex(crypto.getRandomValues(new Uint8Array(12)).buffer)
  let data: ArrayBuffer = enc.encode(`${s}:${password}`).buffer as ArrayBuffer
  for (let i = 0; i < 20_000; i++) data = await crypto.subtle.digest('SHA-256', data)
  return `sha256:${s}:${hex(data)}`
}

/** True when the password matches a stored value, whether hashed or (legacy) plain. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isHashed(stored)) return stored === password
  const salt = stored.split(':')[1]
  return (await hashPassword(password, salt)) === stored
}

/** Login throttling: after five failures the form waits 30 seconds. Kept in session storage so a reload does not reset it. */
export function loginGate(): { blockedFor: number } {
  try { const j = JSON.parse(sessionStorage.getItem('login-gate') ?? '{}'); const until = j.until ?? 0; return { blockedFor: Math.max(0, Math.ceil((until - Date.now()) / 1000)) } } catch { return { blockedFor: 0 } }
}
export function recordLogin(ok: boolean) {
  try {
    const j = JSON.parse(sessionStorage.getItem('login-gate') ?? '{}'); const fails = ok ? 0 : (j.fails ?? 0) + 1
    sessionStorage.setItem('login-gate', JSON.stringify({ fails, until: fails >= 5 ? Date.now() + 30_000 : 0 }))
  } catch { /* ignore */ }
}

export const SESSION_HOURS = 8
