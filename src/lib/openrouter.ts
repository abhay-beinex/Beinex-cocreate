// OpenRouter client: models catalog + streaming chat completions (OpenAI-compatible).
const env = (import.meta as any).env ?? {}
/** Where model calls go: OpenRouter directly in development, or the release proxy (VITE_MODEL_API_BASE) that holds the key. */
export const OR_BASE: string = env.VITE_MODEL_API_BASE || 'https://openrouter.ai/api/v1'
export const PROXY_TOKEN: string = env.VITE_PROXY_TOKEN || ''
/** The sentinel stored as the key when the proxy holds the real one. */
export const PROXY_KEY = 'proxy'
export const usingProxy = !!env.VITE_MODEL_API_BASE

export type ORModel = {
  id: string
  name: string
  description?: string
  context_length: number | null
  pricing: { prompt: string; completion: string }
  architecture?: { input_modalities?: string[]; output_modalities?: string[] }
  supported_parameters?: string[]
  top_provider?: { max_completion_tokens?: number | null; is_moderated?: boolean }
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
}

export type ToolDef = {
  type: 'function'
  function: { name: string; description?: string; parameters: Record<string, unknown> }
}

export type Usage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  cost?: number
}

export const apiHeaders = (key: string): Record<string, string> => ({
  ...(key && key !== PROXY_KEY ? { Authorization: `Bearer ${key}` } : {}),
  ...(PROXY_TOKEN ? { 'X-Proxy-Token': PROXY_TOKEN } : {}),
  'Content-Type': 'application/json',
  'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'http://localhost',
  'X-Title': 'Beinex Co-Create',
})
const headers = apiHeaders

export async function listModels(key?: string): Promise<ORModel[]> {
  const res = await fetch(`${OR_BASE}/models`, { headers: key ? headers(key) : undefined })
  if (!res.ok) throw new Error(`Models request failed (${res.status})`)
  const json = await res.json()
  return (json.data ?? []) as ORModel[]
}

export async function checkKey(key: string): Promise<{ label?: string; usage?: number; limit?: number | null }> {
  const res = await fetch(`${OR_BASE}/auth/key`, { headers: headers(key) })
  if (!res.ok) throw new Error(res.status === 401 ? 'Invalid API key' : `Key check failed (${res.status})`)
  const json = await res.json()
  return json.data ?? {}
}

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_calls'; calls: { id: string; name: string; arguments: string }[] }
  | { type: 'usage'; usage: Usage }
  | { type: 'done' }
  | { type: 'error'; message: string }

export async function* streamChat(opts: {
  key: string
  model: string
  messages: ChatMessage[]
  tools?: ToolDef[]
  temperature?: number
  max_tokens?: number
  signal?: AbortSignal
}): AsyncGenerator<StreamEvent> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
  }
  if (opts.tools?.length) body.tools = opts.tools
  if (opts.temperature !== undefined) body.temperature = opts.temperature
  if (opts.max_tokens) body.max_tokens = opts.max_tokens

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(opts.key),
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`
    try { const j = await res.json(); msg = j?.error?.message ?? msg } catch { /* ignore */ }
    yield { type: 'error', message: msg }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line || line.startsWith(':')) continue // SSE comments like ": OPENROUTER PROCESSING"
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        if (toolAcc.size) yield { type: 'tool_calls', calls: [...toolAcc.values()] }
        yield { type: 'done' }
        return
      }
      let json: any
      try { json = JSON.parse(data) } catch { continue }
      if (json.error) { yield { type: 'error', message: json.error.message ?? 'Stream error' }; return }
      const choice = json.choices?.[0]
      const delta = choice?.delta
      if (delta?.content) yield { type: 'delta', text: delta.content }
      if (delta?.reasoning) yield { type: 'reasoning', text: delta.reasoning }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          const cur = toolAcc.get(idx) ?? { id: tc.id ?? `call_${idx}`, name: '', arguments: '' }
          if (tc.id) cur.id = tc.id
          if (tc.function?.name) cur.name += tc.function.name
          if (tc.function?.arguments) cur.arguments += tc.function.arguments
          toolAcc.set(idx, cur)
        }
      }
      if (json.usage) {
        yield { type: 'usage', usage: json.usage }
      }
    }
  }
  if (toolAcc.size) yield { type: 'tool_calls', calls: [...toolAcc.values()] }
  yield { type: 'done' }
}

export const fmtPrice = (perToken: string) => {
  const n = parseFloat(perToken) * 1_000_000
  if (!isFinite(n)) return '—'
  if (n === 0) return 'free'
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(1)}/M`
}
