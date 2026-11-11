// Agent evaluations: run each test prompt through the agent, then a model judges the answer against the expectation.
import { runAgentTurn } from './agentRun'
import { streamChat } from './openrouter'
import { parseJsonLoose } from './json'
import type { Agent, AgentTest, CustomTool, Library } from './data'

export type EvalCtx = { key: string; models: { fast: string; balanced: string; reasoning: string }; custom: CustomTool[]; libraries: Library[]; onSpend: (c: number) => void }

export async function runTest(agent: Agent, test: AgentTest, ctx: EvalCtx): Promise<NonNullable<AgentTest['last']>> {
  const t0 = Date.now(); let cost = 0; let output = ''; let error: string | undefined
  for await (const ev of runAgentTurn({ key: ctx.key, model: agent.model, models: ctx.models, custom: ctx.custom, autonomy: agent.autonomy, instructions: agent.instructions, tools: agent.tools, libraries: ctx.libraries.filter((l) => agent.knowledge.includes(l.id)), history: [{ role: 'user', content: test.prompt }], maxRounds: 6 })) {
    if (ev.type === 'text') output += ev.text
    else if (ev.type === 'tool_end') output += ''
    else if (ev.type === 'gated') output += `\n\n[Queued for approval: ${ev.tool}]`
    else if (ev.type === 'done') cost += ev.usage?.cost ?? 0
    else if (ev.type === 'error') error = ev.message
  }
  if (error) return { pass: false, reason: `The agent returned an error: ${error}`, output, at: new Date().toISOString().slice(0, 16).replace('T', ' '), cost, ms: Date.now() - t0 }
  let acc = ''
  for await (const ev of streamChat({ key: ctx.key, model: ctx.models.balanced, temperature: 0, max_tokens: 200, messages: [{ role: 'system', content: 'You grade an AI agent\'s answer against an expectation written by its builder. Be strict but fair: the expectation describes what a good answer must do or contain, not exact wording. Reply ONLY with JSON: {"pass": true|false, "reason": "one sentence"}.' }, { role: 'user', content: `Prompt:\n${test.prompt}\n\nExpectation:\n${test.expect}\n\nAnswer:\n${output.slice(0, 6000)}` }] })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') cost += ev.usage.cost ?? 0 }
  ctx.onSpend(cost)
  let pass = false; let reason = acc.slice(0, 200)
  try { const j = parseJsonLoose(acc); pass = !!j.pass; reason = String(j.reason ?? '') } catch { pass = /"pass"\s*:\s*true/.test(acc) }
  if (!reason.trim()) reason = pass ? 'Met the expectation.' : 'Did not meet the expectation.'
  return { pass, reason, output, at: new Date().toISOString().slice(0, 16).replace('T', ' '), cost, ms: Date.now() - t0 }
}

/** Ask a model for three test cases from the agent's instructions and sample prompts. */
export async function draftTests(agent: Pick<Agent, 'name' | 'description' | 'instructions' | 'samplePrompts' | 'tools'>, ctx: EvalCtx): Promise<{ prompt: string; expect: string }[]> {
  let acc = ''
  for await (const ev of streamChat({ key: ctx.key, model: ctx.models.balanced, temperature: 0.3, messages: [{ role: 'system', content: 'You write test cases for an AI agent. Each test has a realistic, self-contained user prompt that includes any data the agent needs to answer (numbers, quotes, text, names), and a one-sentence expectation describing what a good answer must do or contain (not exact wording). Include one test that checks the agent refuses or escalates something outside its remit. Reply ONLY with JSON: {"tests":[{"prompt":"...","expect":"..."}]} with exactly 3 tests.' }, { role: 'user', content: `Agent: ${agent.name}\n${agent.description}\n\nInstructions:\n${agent.instructions.slice(0, 3000)}\n\nSample prompts: ${agent.samplePrompts.join(' | ')}\nAbilities: ${agent.tools.join(', ')}` }] })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') ctx.onSpend(ev.usage.cost ?? 0) }
  const j = parseJsonLoose(acc)
  return (Array.isArray(j.tests) ? j.tests : []).filter((t: any) => typeof t.prompt === 'string' && typeof t.expect === 'string').slice(0, 5)
}
