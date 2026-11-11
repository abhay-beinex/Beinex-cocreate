// Tolerant JSON extraction for model replies: strips code fences and prose, returns the first balanced object or array.
export function parseJsonLoose<T = any>(text: string): T {
  const t = (text ?? '').replace(/```(?:json)?/gi, '').trim()
  try { return JSON.parse(t) } catch { /* fall through */ }
  const start = [...t.matchAll(/[{[]/g)].map((m) => m.index!).filter((i) => i !== undefined)
  for (const s of start) {
    let depth = 0; let inStr = false; let esc = false
    for (let i = s; i < t.length; i++) {
      const c = t[i]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true
      else if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') { depth--; if (depth === 0) { try { return JSON.parse(t.slice(s, i + 1)) } catch { break } } }
    }
  }
  throw new Error('No JSON found in the reply')
}
