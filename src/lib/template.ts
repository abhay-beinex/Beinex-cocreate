// {{variable}} templates used by workflow steps: {{input}}, {{item}}, {{index}}, {{now}}, {{<step key>}}, {{<step key>.path.in.json}}.
export const slug = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'step'

const lookup = (vars: Record<string, unknown>, path: string[]): unknown => {
  let cur: unknown = vars
  for (let i = 0; i < path.length; i++) {
    const seg = path[i]
    if (cur === undefined || cur === null) return undefined
    if (typeof cur === 'string') { try { cur = JSON.parse(cur) } catch { return undefined } }
    if (Array.isArray(cur) && /^\d+$/.test(seg)) cur = cur[Number(seg)]
    else if (typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg] ?? (cur as Record<string, unknown>)[slug(seg)]
    else return undefined
  }
  return cur
}

export const asText = (v: unknown): string => (v === undefined || v === null ? '' : typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v))

/** Replace every {{ path }} in the template. Unknown variables become empty strings. */
export function render(tpl: string, vars: Record<string, unknown>): string {
  if (!tpl) return ''
  return tpl.replace(/\{\{\s*([\w.\-\s]+?)\s*\}\}/g, (_, raw: string) => {
    const path = raw.trim().split('.').map((p) => p.trim()).filter(Boolean)
    if (path[0] === 'steps') path.shift()
    if (path[0] === 'now') return new Date().toLocaleString()
    return asText(lookup(vars, path))
  })
}

/** Variable names referenced by a template, for validation and hints. */
export const refs = (tpl?: string): string[] => Array.from((tpl ?? '').matchAll(/\{\{\s*([\w\-]+)/g)).map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i)

/** Turn a resolved value into a list of items: JSON array, or one item per line (bullets and numbers stripped). */
export function toList(v: string): string[] {
  const t = (v ?? '').trim(); if (!t) return []
  try { const j = JSON.parse(t); if (Array.isArray(j)) return j.map((x) => asText(x)).filter(Boolean) } catch { /* not JSON */ }
  return t.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
}
