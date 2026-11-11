// Runs an agent turn with tool calling: streams text, executes tools, loops until the model stops calling tools.
import { streamChat, type ChatMessage } from './openrouter'
import { runTool, toolDefs, isWriteTool, type ToolContext } from './tools'
import type { Library, CustomTool, Autonomy } from './data'

export type RunEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; args: string }
  | { type: 'tool_end'; id: string; name: string; result: string }
  | { type: 'gated'; tool: string; args: Record<string, unknown> }
  | { type: 'saved'; title: string; content: string }
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: { prompt_tokens: number; completion_tokens: number; cost?: number } }

export type AgentRunOpts = {
  key: string; model: string; instructions: string; tools: string[]; libraries: Library[]; history: ChatMessage[]
  models: { fast: string; reasoning: string }; custom?: CustomTool[]; autonomy?: Autonomy; signal?: AbortSignal; maxRounds?: number
}

export async function* runAgentTurn(opts: AgentRunOpts): AsyncGenerator<RunEvent> {
  const knowledge = opts.libraries.some((l) => l.docs.length)
    ? `\n\nAttached knowledge (cite the document title when you use it):\n${opts.libraries.flatMap((l) => l.docs.map((d) => `[${l.name} / ${d.title}] ${d.content}`)).join('\n').slice(0, 8000)}`
    : ''
  // Autonomy level 1 (notify only) removes write tools entirely; levels 2 and 3 keep them gated.
  const toolNames = opts.autonomy === 1 ? opts.tools.filter((t) => !isWriteTool(t)) : opts.tools
  const system: ChatMessage = { role: 'system', content: `${opts.instructions}${knowledge}\n\nToday is ${new Date().toISOString().slice(0, 10)}.` }
  const messages: ChatMessage[] = [system, ...opts.history]
  const tools = toolDefs(toolNames, opts.custom)
  let usage: any
  let totalCost = 0
  const gated: { tool: string; args: Record<string, unknown> }[] = []
  const saved: { title: string; content: string }[] = []
  const ctx: ToolContext = { key: opts.key, models: opts.models, libraries: opts.libraries, custom: opts.custom, onGatedAction: (a) => gated.push(a), onSaveDocument: (d) => saved.push(d) }

  for (let round = 0; round < (opts.maxRounds ?? 8); round++) {
    let text = ''
    let calls: { id: string; name: string; arguments: string }[] = []
    for await (const ev of streamChat({ key: opts.key, model: opts.model, messages, tools: tools.length ? tools : undefined, signal: opts.signal })) {
      if (ev.type === 'delta') { text += ev.text; yield { type: 'text', text: ev.text } }
      else if (ev.type === 'tool_calls') calls = ev.calls
      else if (ev.type === 'usage') { usage = ev.usage; totalCost += ev.usage.cost ?? 0 }
      else if (ev.type === 'error') { yield { type: 'error', message: ev.message }; return }
    }
    if (!calls.length) break
    messages.push({ role: 'assistant', content: text || '', tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) })
    for (const c of calls) {
      yield { type: 'tool_start', id: c.id, name: c.name, args: c.arguments }
      const result = await runTool(c.name, c.arguments, ctx)
      yield { type: 'tool_end', id: c.id, name: c.name, result }
      messages.push({ role: 'tool', tool_call_id: c.id, content: result })
    }
    while (gated.length) yield { type: 'gated', ...gated.shift()! }
    while (saved.length) yield { type: 'saved', ...saved.shift()! }
  }
  yield { type: 'done', usage: usage ? { ...usage, cost: totalCost } : undefined }
}
