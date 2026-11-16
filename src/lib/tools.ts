// Built-in and custom tools. Read tools run in the browser; write tools are gated and only queue work for a person.
import { OR_BASE, apiHeaders } from './openrouter'
import type { ToolDef } from './openrouter'
import type { Library, CustomTool } from './data'

export type ToolMeta = { name: string; label: string; desc: string; write: boolean; category: 'Web' | 'Reasoning' | 'Knowledge' | 'Actions' | 'Custom' }

export const TOOLS: ToolMeta[] = [
  { name: 'web_search', label: 'Web search', desc: 'Search the live web and get results with sources', write: false, category: 'Web' },
  { name: 'deep_research', label: 'Deep research', desc: 'Multi-angle research on a topic, returns a sourced report', write: false, category: 'Web' },
  { name: 'read_url', label: 'Read web page', desc: 'Open a URL and read its text', write: false, category: 'Web' },
  { name: 'calculate', label: 'Calculator', desc: 'Evaluate a maths expression exactly', write: false, category: 'Reasoning' },
  { name: 'run_javascript', label: 'Run JavaScript', desc: 'Run a short script in a sandbox for data work', write: false, category: 'Reasoning' },
  { name: 'current_datetime', label: 'Date and time', desc: 'The current date, time and timezone', write: false, category: 'Reasoning' },
  { name: 'search_knowledge', label: 'Knowledge search', desc: 'Search the libraries attached to the agent', write: false, category: 'Knowledge' },
  { name: 'save_document', label: 'Save document', desc: 'Save a document into the Agent outputs library', write: false, category: 'Knowledge' },
  { name: 'draft_email', label: 'Draft email', desc: 'Create an email draft for a person to send', write: true, category: 'Actions' },
  { name: 'request_approval', label: 'Request approval', desc: 'Ask a person to approve an action before it happens', write: true, category: 'Actions' },
]
export const isWriteTool = (name: string) => TOOLS.find((t) => t.name === name)?.write ?? false

const DEFS: Record<string, ToolDef> = {
  web_search: { type: 'function', function: { name: 'web_search', description: 'Search the live web. Returns a summary of findings with source URLs. Use specific queries.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  deep_research: { type: 'function', function: { name: 'deep_research', description: 'Thorough research on a topic across many sources. Slower than web_search. Returns a structured report with sources.', parameters: { type: 'object', properties: { topic: { type: 'string' }, focus: { type: 'string', description: 'Optional angle, e.g. pricing, risks, regulation' } }, required: ['topic'] } } },
  read_url: { type: 'function', function: { name: 'read_url', description: 'Fetch a web page and return its readable text (truncated).', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } } },
  calculate: { type: 'function', function: { name: 'calculate', description: 'Evaluate a mathematical expression. Supports + - * / % ** parentheses and Math functions (sqrt, pow, round, log, …).', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'] } } },
  run_javascript: { type: 'function', function: { name: 'run_javascript', description: 'Run JavaScript in a sandbox (no network, no DOM, 5 second limit). Use console.log or return a value. Good for parsing data, statistics and transformations.', parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } } },
  current_datetime: { type: 'function', function: { name: 'current_datetime', description: 'Get the current date, time and timezone.', parameters: { type: 'object', properties: {} } } },
  search_knowledge: { type: 'function', function: { name: 'search_knowledge', description: 'Search the knowledge libraries attached to this agent.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
  save_document: { type: 'function', function: { name: 'save_document', description: 'Save a document (markdown) into the Agent outputs library so people can find it later.', parameters: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title', 'content'] } } },
  draft_email: { type: 'function', function: { name: 'draft_email', description: 'Create an email draft for a person to review and send. Never sends.', parameters: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' } }, required: ['to', 'subject', 'body'] } } },
  request_approval: { type: 'function', function: { name: 'request_approval', description: 'Ask a person to approve an action before it is taken. Describe the action and why.', parameters: { type: 'object', properties: { action: { type: 'string' }, reason: { type: 'string' } }, required: ['action'] } } },
}

export const customToolDef = (t: CustomTool): ToolDef => ({ type: 'function', function: { name: t.name, description: t.description, parameters: { type: 'object', properties: Object.fromEntries(t.params.map((p) => [p.name, { type: 'string', description: p.description }])), required: t.params.map((p) => p.name) } } })
export const toolDefs = (names: string[], custom: CustomTool[] = []): ToolDef[] => names.map((n) => DEFS[n] ?? (custom.find((c) => c.name === n) ? customToolDef(custom.find((c) => c.name === n)!) : undefined)).filter(Boolean) as ToolDef[]

export type ToolContext = {
  key: string
  models: { fast: string; reasoning: string }
  libraries: Library[]
  custom?: CustomTool[]
  onGatedAction?: (a: { tool: string; args: Record<string, unknown> }) => void
  onSaveDocument?: (d: { title: string; content: string }) => void
}

const headers = apiHeaders

async function webAnswer(ctx: ToolContext, prompt: string, model: string, maxResults: number, maxTokens: number): Promise<string> {
  const res = await fetch(`${OR_BASE}/chat/completions`, { method: 'POST', headers: headers(ctx.key), body: JSON.stringify({ model, plugins: [{ id: 'web', max_results: maxResults }], messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }) })
  if (!res.ok) { let m = `Search failed (${res.status})`; try { m = (await res.json()).error?.message ?? m } catch { /* ignore */ } return m }
  const j = await res.json()
  const msg = j.choices?.[0]?.message
  const cites: string[] = (msg?.annotations ?? []).filter((a: any) => a.type === 'url_citation').map((a: any) => `${a.url_citation?.title ?? ''} ${a.url_citation?.url ?? ''}`.trim())
  return (msg?.content ?? '') + (cites.length ? `\n\nSources:\n${[...new Set(cites)].slice(0, 12).map((c) => `- ${c}`).join('\n')}` : '')
}

const sandbox = (code: string) => new Promise<string>((resolve) => {
  const src = `for (const k of ['fetch','XMLHttpRequest','WebSocket','importScripts','EventSource','navigator','indexedDB','caches']) { try { Object.defineProperty(self, k, { value: undefined, configurable: false, writable: false }) } catch (_) {} }
self.onmessage = async (e) => { const logs = []; const console = { log: (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')) }; try { const fn = new Function('console', 'return (async () => { ' + e.data + ' })()'); const r = await fn(console); self.postMessage({ ok: true, logs, result: r === undefined ? undefined : (typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r)) }) } catch (err) { self.postMessage({ ok: false, logs, error: String(err && err.message || err) }) } }`
  const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })))
  const timer = setTimeout(() => { w.terminate(); resolve('Error: script exceeded the 5 second limit.') }, 5000)
  w.onmessage = (e) => { clearTimeout(timer); w.terminate(); const d = e.data; resolve((d.logs.length ? `Console:\n${d.logs.join('\n')}\n` : '') + (d.ok ? (d.result !== undefined ? `Result: ${d.result}` : d.logs.length ? '' : 'Done (no output).') : `Error: ${d.error}`)) }
  w.onerror = (e) => { clearTimeout(timer); w.terminate(); resolve(`Error: ${e.message}`) }
  w.postMessage(code)
})

const fill = (tpl: string, args: Record<string, unknown>) => tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(args[k] ?? '')))

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: any = {}
  try { args = JSON.parse(rawArgs || '{}') } catch { /* ignore */ }
  try {
    const custom = ctx.custom?.find((c) => c.name === name)
    if (custom) {
      const url = fill(custom.url, args)
      let hdrs: Record<string, string> = {}
      try { hdrs = custom.headers ? JSON.parse(custom.headers) : {} } catch { return 'Tool misconfigured: headers must be JSON.' }
      const isJsonBody = custom.body.trim().startsWith('{') || custom.body.trim().startsWith('[')
      const bodyStr = custom.method === 'POST' ? custom.body.replace(/\{(\w+)\}/g, (_, k) => {
        const raw = String(args[k] ?? '')
        return isJsonBody ? JSON.stringify(raw).slice(1, -1) : raw
      }) : undefined
      const res = await fetch(url, { method: custom.method, headers: hdrs, body: bodyStr })
      const text = await res.text()
      return `HTTP ${res.status}\n${text.length > 12000 ? text.slice(0, 12000) + '\n…[truncated]' : text}`
    }
    switch (name) {
      case 'web_search':
        if (!ctx.key) return 'Web search is not available right now.'
        return await webAnswer(ctx, `Search the web for: ${args.query}\nReturn the most relevant findings as concise bullets with the source URL after each bullet. Include dates where relevant.`, ctx.models.fast, 5, 900)
      case 'deep_research':
        if (!ctx.key) return 'Deep research is not available right now.'
        return await webAnswer(ctx, `Do thorough research on: ${args.topic}${args.focus ? `\nFocus: ${args.focus}` : ''}\nCover background, current state, key players, numbers, risks and open questions. Use several searches with different angles. Return a structured report with headings, concise bullets, and a source URL after each factual claim. Finish with a short list of the best sources.`, ctx.models.reasoning, 10, 2500)
      case 'read_url': {
        const url = String(args.url ?? '').trim(); if (!/^https?:\/\//i.test(url)) return 'Provide a full http(s) URL.'
        const res = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: 'text/plain' } })
        if (!res.ok) return `Could not read the page (${res.status}).`
        const text = await res.text()
        return text.length > 14000 ? text.slice(0, 14000) + '\n…[truncated]' : text
      }
      case 'calculate': {
        const expr = String(args.expression ?? '')
        if (!/^[\d\s+\-*/%().,eE^a-zA-Z_]+$/.test(expr) || /[;=]|=>|function|while|for|import|require/i.test(expr)) return 'Only mathematical expressions are allowed.'
        const names = Object.getOwnPropertyNames(Math)
        const fn = new Function(...names, `"use strict"; return (${expr.replace(/\^/g, '**')})`)
        const v = fn(...names.map((k) => (Math as any)[k]))
        return `${expr} = ${typeof v === 'number' ? Number(v.toPrecision(12)).toString() : String(v)}`
      }
      case 'run_javascript': return await sandbox(String(args.code ?? ''))
      case 'current_datetime': { const d = new Date(); return `${d.toString()} (ISO ${d.toISOString()}, timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone})` }
      case 'search_knowledge': {
        const words = String(args.query ?? '').toLowerCase().split(/\W+/).filter((w) => w.length > 2)
        const hits = ctx.libraries.flatMap((l) => l.docs.map((d) => ({ library: l.name, title: d.title, content: d.content.slice(0, 1500), score: words.filter((w) => (d.title + ' ' + d.content).toLowerCase().includes(w)).length }))).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
        return hits.length ? JSON.stringify(hits.map(({ score, ...h }) => h)) : ctx.libraries.some((l) => l.docs.length) ? 'No matching documents in the attached libraries.' : 'No knowledge libraries are attached to this agent, or they are empty.'
      }
      case 'save_document': { ctx.onSaveDocument?.({ title: String(args.title ?? 'Untitled'), content: String(args.content ?? '') }); return `Saved "${args.title}" to the Agent outputs library.` }
      case 'draft_email': { ctx.onGatedAction?.({ tool: name, args }); return JSON.stringify({ status: 'draft_created', note: 'Draft queued for a person to review and send.', to: args.to, subject: args.subject }) }
      case 'request_approval': { ctx.onGatedAction?.({ tool: name, args }); return JSON.stringify({ status: 'approval_requested', note: 'A person has been asked to approve this action. Do not proceed until approved.', action: args.action }) }
      default: return `Unknown tool ${name}.`
    }
  } catch (e: any) { return `Tool error: ${e?.message ?? e}` }
}
