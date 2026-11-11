// Workflow engine: walks the graph step by step with variables, loops, parallel branches, retries, conditions,
// code and HTTP steps, pauses at human gates and resumes after a decision.
import { runAgentTurn } from './agentRun'
import { streamChat } from './openrouter'
import { runTool } from './tools'
import { render, toList, slug } from './template'
import { parseJsonLoose } from './json'
import { nextOf, outEdges, joinOf, keyOf } from './flow'
import type { Workflow, WfNode, Run, RunStep, Agent, Council, Library, CustomTool, User, StepData } from './data'

export type EngineCtx = {
  key: string
  models: { fast: string; balanced: string; reasoning: string }
  agents: Agent[]
  councils: Council[]
  libraries: Library[]
  custom: CustomTool[]
  users: User[]
  workflows: Workflow[]
  canSpend: () => boolean
  onSpend: (cost: number) => void
  onSaveDocument: (d: { title: string; content: string }) => void
  onNotify: (n: { title: string; body?: string; link?: string; kind: 'run' | 'approval' | 'schedule' | 'info' }) => void
  onUpdate: (run: Run) => void
  /** Runs another workflow as a child run and resolves when it finishes (or pauses). */
  runChild?: (wf: Workflow, input: string, parent: Run) => Promise<Run>
}

const DEFAULT_STEP_TOOLS = ['web_search', 'read_url', 'calculate', 'run_javascript', 'current_datetime', 'search_knowledge', 'save_document']
const now = () => new Date().toISOString().slice(0, 16).replace('T', ' ')
const short = (m?: string) => (m ?? '').split('/')[1] ?? m
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const startNode = (wf: Workflow) => wf.nodes.find((n) => n.data.brick === 'trigger') ?? wf.nodes.find((n) => !wf.edges.some((e) => e.target === n.id)) ?? wf.nodes[0]

export function newRun(wf: Workflow, input: string, trigger: string, startedBy: string): Run {
  return { id: 'pending', kind: 'workflow', workflowId: wf.id, workflow: wf.name, trigger, status: 'running', started: now(), duration: '0s', cost: 0, steps: [], summary: input.slice(0, 120), input, context: `Input:\n${input}`, vars: { input }, cursor: startNode(wf)?.id ?? null, startedBy }
}

async function collect(gen: AsyncGenerator<any>, onSave?: (d: { title: string; content: string }) => void): Promise<{ text: string; cost: number; error?: string; gated: string[] }> {
  let text = ''; let cost = 0; let error: string | undefined; const gated: string[] = []
  for await (const ev of gen) {
    if (ev.type === 'text') text += ev.text
    else if (ev.type === 'done') cost += ev.usage?.cost ?? 0
    else if (ev.type === 'error') error = ev.message
    else if (ev.type === 'gated') gated.push(`${ev.tool}: ${JSON.stringify(ev.args).slice(0, 200)}`)
    else if (ev.type === 'saved') onSave?.({ title: ev.title, content: ev.content })
  }
  return { text, cost, error, gated }
}

/** What a step sees and writes: the running context text, named variables, and the latest result. */
export type State = { context: string; vars: Record<string, string>; last: string }
type Outcome = 'done' | 'waiting' | 'failed'
type WalkOpts = { depth: number; lane?: string; stopAt?: (id: string) => boolean; onStop?: (id?: string) => void }

/** Builds a step runner bound to one run. Used by execute() and by single-step tries in the builder. */
export function makeEngine(run: Run, wf: Workflow, ctx: EngineCtx) {
  const nodes = new Map(wf.nodes.map((n) => [n.id, n]))
  const t0 = Date.now() - (parseInt(run.duration) || 0) * 1000
  const touch = () => { run.duration = `${Math.round((Date.now() - t0) / 1000)}s`; ctx.onUpdate({ ...run, steps: [...run.steps] }) }
  const spend = (c: number) => { ctx.onSpend(c); run.cost += c }
  const guard = (): string | undefined => (!ctx.key ? 'Models are not available right now. Contact your administrator.' : !ctx.canSpend() ? 'Daily spend cap reached for this user. Raise the cap under Settings › Governance or try tomorrow.' : undefined)
  const toolCtx = { key: ctx.key, models: ctx.models, libraries: ctx.libraries, custom: ctx.custom, onSaveDocument: ctx.onSaveDocument }

  const record = (st: State, d: StepData, key: string, text: string) => { st.vars[key] = text; st.last = text; st.context += `\n\n[${d.label}]\n${text}` }

  /** Runs one step once. Returns the step record and, for conditions, the branch taken. */
  async function runStep(node: WfNode, st: State, lane?: string): Promise<{ step: RunStep; branch?: string }> {
    const d = node.data; const key = keyOf(d); const s0 = Date.now()
    const step: RunStep = { name: d.label, nodeId: node.id, brick: d.brick, ms: 0, status: 'ok', lane, key: ['agent', 'council', 'tool', 'code', 'http', 'flow', 'extract', 'classify'].includes(d.brick) ? key : undefined }
    const r = (tpl?: string) => render(tpl ?? '', st.vars)
    const stepInput = d.input?.trim() ? r(d.input) : st.context
    let branch: string | undefined
    try {
      if (d.brick === 'trigger') step.output = `Started with:\n${run.input ?? ''}`
      else if (d.brick === 'wait') { const secs = Math.min(600, Math.max(1, d.wait ?? 30)); await sleep(secs * 1000); step.output = `Waited ${secs} second${secs === 1 ? '' : 's'}.` }
      else if (d.brick === 'set') {
        const lines: string[] = []; const setVars: Record<string, string> = {}
        for (const a of d.assign ?? []) { if (!a.key.trim()) continue; const k = slug(a.key); const v = r(a.value); st.vars[k] = v; setVars[k] = v; lines.push(`{{${k}}} = ${v.slice(0, 200).replace(/\n/g, ' ')}`) }
        step.vars = setVars; step.output = lines.join('\n') || 'Nothing to set.'
      }
      else if (d.brick === 'extract' || d.brick === 'classify') {
        const g = guard(); if (g) { step.status = 'failed'; step.output = g }
        else if (d.brick === 'extract') {
          const fields = (d.fields ?? []).filter((f) => f.name.trim())
          let ans = ''
          for await (const ev of streamChat({ key: ctx.key, model: ctx.models.fast, temperature: 0, messages: [{ role: 'system', content: `Extract these fields from the text and reply with ONE JSON object and nothing else. Keys: ${fields.map((f) => `"${slug(f.name)}" (${f.description || f.name})`).join(', ')}. Use null when a field is not present. Keep values short.` }, { role: 'user', content: stepInput.slice(0, 12000) }] })) { if (ev.type === 'delta') ans += ev.text; if (ev.type === 'usage') { spend(ev.usage.cost ?? 0); step.cost = ev.usage.cost } }
          const obj = parseJsonLoose(ans)
          const json = JSON.stringify(obj, null, 2)
          const rawJson = JSON.stringify(obj)
          step.model = short(ctx.models.fast); step.output = '```json\n' + json + '\n```'; step.vars = { [key]: rawJson }; st.vars[key] = rawJson; st.last = json
        } else {
          const cats = (d.categories ?? []).map((c) => c.trim()).filter(Boolean)
          let ans = ''
          for await (const ev of streamChat({ key: ctx.key, model: ctx.models.balanced, temperature: 0, max_tokens: 60, messages: [{ role: 'system', content: `Sort the text into exactly one of these categories: ${cats.join(' | ')}. Reply with the category name only, spelled exactly as given.` }, { role: 'user', content: stepInput.slice(0, 12000) }] })) { if (ev.type === 'delta') ans += ev.text; if (ev.type === 'usage') { spend(ev.usage.cost ?? 0); step.cost = ev.usage.cost } }
          const pick = cats.find((c) => c.toLowerCase() === ans.trim().toLowerCase()) ?? cats.find((c) => ans.toLowerCase().includes(c.toLowerCase())) ?? cats[cats.length - 1]
          branch = pick.toLowerCase(); step.branch = pick; step.model = short(ctx.models.balanced); step.output = `Category → **${pick}**`; st.vars[key] = pick
        }
      }
      else if (d.brick === 'agent' || d.brick === 'council' || d.brick === 'tool' || (d.brick === 'logic' && d.mode !== 'rule')) {
        const g = guard(); if (g) { step.status = 'failed'; step.output = g }
        else if (d.brick === 'agent') {
          const a = ctx.agents.find((x) => x.id === d.agentId)
          const signal = d.timeout ? AbortSignal.timeout(d.timeout * 1000) : undefined
          const res = await collect(runAgentTurn({ key: ctx.key, model: a?.model ?? d.model ?? ctx.models.balanced, models: ctx.models, custom: ctx.custom, autonomy: a?.autonomy ?? wf.autonomy, signal,
            instructions: (a?.instructions ?? 'You are a capable assistant working inside an automated workflow.') + (d.prompt ? `\n\nStep instructions: ${r(d.prompt)}` : '') + (d.input?.trim() ? '\n\nYou receive the input for this step. Produce the output for this step only. Be complete but concise.' : '\n\nYou receive the workflow context so far. Produce the output for this step only. Be complete but concise.'),
            tools: a?.tools ?? DEFAULT_STEP_TOOLS, libraries: ctx.libraries.filter((l) => (a ? a.knowledge.includes(l.id) : l.id === 'company')), history: [{ role: 'user', content: stepInput }], maxRounds: 6 }), ctx.onSaveDocument)
          spend(res.cost); step.cost = res.cost; step.model = short(a?.model ?? d.model)
          if (res.error) { step.status = 'failed'; step.output = `Error: ${res.error}` } else { step.output = res.text + (res.gated.length ? `\n\nQueued for approval: ${res.gated.join('; ')}` : ''); record(st, d, key, res.text) }
        } else if (d.brick === 'council') {
          const c = ctx.councils.find((x) => x.id === d.councilId)
          if (!c) { step.status = 'failed'; step.output = 'No council selected for this step.' }
          else {
            const findings: string[] = []
            for (const id of c.members) {
              const a = ctx.agents.find((x) => x.id === id); if (!a) continue
              const res = await collect(runAgentTurn({ key: ctx.key, model: a.model, models: ctx.models, custom: ctx.custom, autonomy: 1, instructions: a.instructions + '\n\nYou are a member of a council. Give your findings on the case in under 120 words with a clear position (Approve / Reject / Need more info).', tools: a.tools, libraries: ctx.libraries.filter((l) => a.knowledge.includes(l.id)), history: [{ role: 'user', content: stepInput }], maxRounds: 4 }))
              spend(res.cost); step.cost = (step.cost ?? 0) + res.cost; findings.push(`${a.name}:\n${res.text}`)
            }
            const modeHint = { consensus: 'Seek consensus; note any dissent.', debate: 'Cross-examine each finding, surface contradictions, then conclude.', quorum: 'Count positions; a majority decides, note the vote.' }[c.mode]
            let syn = ''
            for await (const ev of streamChat({ key: ctx.key, model: c.model, messages: [{ role: 'system', content: `You synthesise a council's findings into one recommendation for the human gatekeeper. ${modeHint} Output: Recommendation (one line), Confidence (0-100%), Key reasons (3 bullets), Dissent (if any). Under 150 words.` }, { role: 'user', content: `${stepInput}\n\nFindings:\n${findings.join('\n\n')}` }] })) { if (ev.type === 'delta') syn += ev.text; if (ev.type === 'usage') { spend(ev.usage.cost ?? 0); step.cost = (step.cost ?? 0) + (ev.usage.cost ?? 0) } }
            step.model = short(c.model); step.output = `${findings.map((f) => `**${f.split(':\n')[0]}**\n${f.split(':\n').slice(1).join(':\n')}`).join('\n\n')}\n\n**Council recommendation**\n${syn}`
            record(st, d, key, syn)
          }
        } else if (d.brick === 'logic') {
          let ans = ''
          for await (const ev of streamChat({ key: ctx.key, model: ctx.models.balanced, temperature: 0, max_tokens: 120, messages: [{ role: 'system', content: 'You evaluate a plain-language condition for a workflow. Judge it mainly on the LATEST OUTPUT; use the earlier context only for background. Reply with one short sentence of reasoning, then a final line that is exactly "VERDICT: yes" or "VERDICT: no".' }, { role: 'user', content: `Earlier context (background):\n${st.context.slice(-3000)}\n\nLATEST OUTPUT:\n${(d.input?.trim() ? stepInput : st.last || run.input || '').slice(0, 6000)}\n\nCondition: ${r(d.sub) || d.label}` }] })) { if (ev.type === 'delta') ans += ev.text; if (ev.type === 'usage') { spend(ev.usage.cost ?? 0); step.cost = ev.usage.cost } }
          const verdict = ans.match(/VERDICT:\s*(yes|no)/i)?.[1] ?? (/\byes\b/i.test(ans.split('\n').pop() ?? '') ? 'yes' : 'no')
          branch = verdict.toLowerCase() === 'yes' ? 'yes' : 'no'
          step.branch = branch; step.model = short(ctx.models.balanced); step.output = `Condition "${r(d.sub) || d.label}" → **${branch}**\n\n${ans.replace(/VERDICT:.*$/i, '').trim()}`
        } else if (d.brick === 'tool') {
          const tool = d.tool ?? 'save_document'
          const res = await collect(runAgentTurn({ key: ctx.key, model: ctx.models.fast, models: ctx.models, custom: ctx.custom, autonomy: 2, instructions: `You must call the tool "${tool}" exactly once with arguments derived from the input, then reply with one line confirming what you did.${d.prompt ? ` Guidance: ${r(d.prompt)}` : ''}`, tools: [tool], libraries: ctx.libraries, history: [{ role: 'user', content: stepInput }], maxRounds: 2 }), ctx.onSaveDocument)
          spend(res.cost); step.cost = res.cost; step.model = short(ctx.models.fast)
          if (res.error) { step.status = 'failed'; step.output = `Error: ${res.error}` } else { step.output = res.text + (res.gated.length ? `\n\nQueued for approval: ${res.gated.join('; ')}` : ''); st.vars[key] = res.text }
        }
      } else if (d.brick === 'logic') {
        const rule = d.rule ?? { left: '', op: 'not_empty' as const, right: '' }
        const left = r(rule.left).trim(); const right = r(rule.right ?? '').trim()
        const num = (s: string) => parseFloat(s.replace(/[^0-9.\-]/g, ''))
        const yes = { contains: () => left.toLowerCase().includes(right.toLowerCase()), not_contains: () => !left.toLowerCase().includes(right.toLowerCase()), equals: () => left.toLowerCase() === right.toLowerCase(), not_equals: () => left.toLowerCase() !== right.toLowerCase(), empty: () => left === '', not_empty: () => left !== '', gt: () => num(left) > num(right), lt: () => num(left) < num(right), matches: () => { try { return new RegExp(right, 'i').test(left) } catch { return false } } }[rule.op]()
        branch = yes ? 'yes' : 'no'; step.branch = branch
        step.output = `Rule: ${rule.left} ${rule.op.replace('_', ' ')}${rule.op === 'empty' || rule.op === 'not_empty' ? '' : ` "${rule.right}"`} → **${branch}**\n\nChecked value: ${left.slice(0, 300) || '(empty)'}`
      } else if (d.brick === 'code') {
        const wrapped = `const vars = ${JSON.stringify(st.vars)}; const input = vars.input; const item = vars.item; const context = ${JSON.stringify(st.context.slice(-20000))};\n${d.code ?? ''}`
        const out = await runTool('run_javascript', JSON.stringify({ code: wrapped }), toolCtx)
        if (/^Error:|\nError:/.test(out)) { step.status = 'failed'; step.output = out }
        else { const m = out.match(/Result: ([\s\S]*)$/); const value = m ? m[1] : out.replace(/^Console:\n/, '').replace(/\nDone \(no output\)\.$/, '').trim(); step.output = out; record(st, d, key, value) }
      } else if (d.brick === 'http') {
        const url = r(d.url).trim()
        let headers: Record<string, string> = {}
        try { headers = d.headers?.trim() ? JSON.parse(r(d.headers)) : {} } catch { throw new Error('Headers must be JSON, e.g. {"Authorization": "Bearer …"}') }
        const method = d.method ?? 'GET'
        const res = await fetch(url, { method, headers, body: method === 'GET' ? undefined : r(d.body), signal: AbortSignal.timeout((d.timeout || 120) * 1000) })
        const text = await res.text()
        step.output = `${method} ${url}\nHTTP ${res.status}\n\n${text.length > 6000 ? text.slice(0, 6000) + '\n…[truncated]' : text}`
        if (!res.ok) step.status = 'failed'
        else record(st, d, key, text)
      } else if (d.brick === 'flow') {
        const child = ctx.workflows.find((w) => w.id === d.workflowId)
        if (!child) throw new Error('The workflow to run no longer exists.')
        if (child.id === wf.id) throw new Error('A workflow cannot run itself.')
        if (!ctx.runChild) throw new Error('Child runs are not available here.')
        const cr = await ctx.runChild(child, d.input?.trim() ? stepInput : (st.last || run.input || ''), run)
        step.cost = cr.cost; run.cost += 0
        if (cr.status === 'failed') { step.status = 'failed'; step.output = `${child.name} (${cr.id}) failed: ${[...cr.steps].reverse().find((s) => s.status === 'failed')?.output ?? ''}` }
        else if (cr.status === 'waiting') { step.status = 'failed'; step.output = `${child.name} (${cr.id}) paused for an approval. Workflows run as a step cannot wait for a person; move the approval into this workflow.` }
        else { const text = summarise(cr); step.output = `${child.name} · ${cr.id} · ${cr.steps.length} steps\n\n${text}`; record(st, d, key, text) }
      } else if (d.brick === 'notify') {
        ctx.onNotify({ title: `${wf.name}: ${d.label}`, body: (d.input?.trim() ? stepInput : st.last || run.summary || '').slice(0, 300), link: `/runs?open=${run.id}`, kind: 'info' })
        step.output = 'In-app notification sent.'
      }
    } catch (e: any) { step.status = 'failed'; step.output = `Error: ${e?.name === 'TimeoutError' ? `took longer than ${d.timeout}s` : e?.message ?? e}` }
    step.ms = Date.now() - s0
    return { step, branch }
  }

  /** Runs a step with retries and the step's on-error choice. Pushes the step record. */
  async function runWithRetries(node: WfNode, st: State, lane?: string): Promise<{ ok: boolean; branch?: string }> {
    const d = node.data
    const attempts = ['agent', 'council', 'tool', 'code', 'http', 'flow', 'logic', 'extract', 'classify'].includes(d.brick) ? Math.max(1, (d.retries ?? 0) + 1) : 1
    let last: { step: RunStep; branch?: string } | null = null
    for (let i = 1; i <= attempts; i++) {
      last = await runStep(node, st, lane)
      if (i > 1) last.step.attempt = i
      if (last.step.status !== 'failed') break
      if (i < attempts) { last.step.name = `${d.label} (attempt ${i})`; run.steps.push(last.step); touch(); await sleep(600 * i) }
    }
    const { step, branch } = last!
    if (step.status === 'failed' && d.onError === 'continue') { step.continued = true; st.vars[keyOf(d)] = ''; }
    run.steps.push(step); run.cost = Math.round(run.cost * 1e6) / 1e6; touch()
    return { ok: step.status !== 'failed' || d.onError === 'continue', branch }
  }

  async function runLoop(node: WfNode, st: State, opts: WalkOpts): Promise<Outcome> {
    const d = node.data; const key = keyOf(d); const s0 = Date.now()
    const step: RunStep = { name: d.label, nodeId: node.id, brick: 'loop', ms: 0, status: 'ok', key, lane: opts.lane }
    let items: string[] = []
    try {
      if (d.items?.trim()) items = toList(render(d.items, st.vars))
      else {
        const g = guard(); if (g) throw new Error(g)
        let ans = ''
        for await (const ev of streamChat({ key: ctx.key, model: ctx.models.fast, temperature: 0, messages: [{ role: 'system', content: 'Extract the list of distinct items from the text as a JSON array of short strings. Reply with the JSON array only.' }, { role: 'user', content: (st.last || run.input || '').slice(0, 8000) }] })) { if (ev.type === 'delta') ans += ev.text; if (ev.type === 'usage') { spend(ev.usage.cost ?? 0); step.cost = ev.usage.cost } }
        try { const arr = parseJsonLoose(ans); items = Array.isArray(arr) ? arr.map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x))) : toList(ans) } catch { items = toList(ans) }
      }
    } catch (e: any) { step.status = 'failed'; step.output = `Error: ${e?.message ?? e}`; step.ms = Date.now() - s0; run.steps.push(step); touch(); return 'failed' }
    const max = Math.min(Math.max(1, d.maxItems ?? 10), 25)
    const truncated = items.length > max; items = items.slice(0, max)
    const each = nextOf(wf.edges, node.id, 'each'); const done = nextOf(wf.edges, node.id, 'done')
    const doneReachable = new Set<string>()
    if (done) {
      const q = [done]
      while (q.length) {
        const cur = q.shift()!
        if (doneReachable.has(cur) || cur === node.id) continue
        doneReachable.add(cur)
        for (const e of outEdges(wf.edges, cur)) q.push(e.target)
      }
    }
    step.count = items.length; step.output = items.length ? `${items.length} item${items.length === 1 ? '' : 's'}${truncated ? ` (capped at ${max})` : ''}:\n${items.map((it, i) => `${i + 1}. ${it}`).join('\n')}` : 'No items found, so the Each branch was skipped.'
    step.ms = Date.now() - s0; run.steps.push(step); touch()
    const results: string[] = []
    const perStepVars: Record<string, string[]> = {}
    for (let i = 0; i < items.length; i++) {
      const sub: State = { context: `${st.context}\n\n[${d.label} · item ${i + 1} of ${items.length}]\n${items[i]}`, vars: { ...st.vars, item: items[i], index: String(i + 1), count: String(items.length) }, last: items[i] }
      const out = await walk(each, sub, { depth: opts.depth + 1, lane: `Item ${i + 1} of ${items.length}`, stopAt: (id) => id === node.id || id === done || doneReachable.has(id) })
      if (out === 'failed') { if (d.onError === 'continue') { results.push('(failed)'); continue } return 'failed' }
      if (out === 'waiting') return 'waiting'
      results.push(sub.last)
      for (const [k, v] of Object.entries(sub.vars)) {
        if (k === 'item' || k === 'index' || k === 'count' || st.vars[k] === v) continue
        ;(perStepVars[k] ??= []).push(`${i + 1}. ${items[i]}\n${v}`)
      }
    }
    const combined = results.map((r, i) => `${i + 1}. ${items[i]}\n${r}`).join('\n\n')
    const loopVars: Record<string, string> = { [key]: combined, [`${key}_items`]: JSON.stringify(items) }
    for (const [k, vals] of Object.entries(perStepVars)) { const joined = vals.join('\n\n'); st.vars[k] = joined; loopVars[k] = joined }
    step.vars = loopVars
    st.vars[key] = combined; st.vars[`${key}_items`] = JSON.stringify(items); st.last = combined; st.context += `\n\n[${d.label} · results]\n${combined}`
    return 'done'
  }

  async function runParallel(node: WfNode, st: State, opts: WalkOpts): Promise<{ outcome: Outcome; join?: string }> {
    const d = node.data; const s0 = Date.now()
    const outs = outEdges(wf.edges, node.id)
    const join = joinOf(node.id, wf.edges)
    const names = outs.map((e) => nodes.get(e.target)?.data.label ?? e.target)
    const step: RunStep = { name: d.label, nodeId: node.id, brick: 'parallel', ms: 0, status: 'ok', count: outs.length, lane: opts.lane, output: `${outs.length} branches at once: ${names.join(', ')}.${join ? ` They join at ${nodes.get(join)?.data.label}.` : ''}` }
    run.steps.push(step); touch()

    // Identify intermediate convergence nodes where 2+ branches meet before the final join.
    const branchReach = new Map<string, number>()
    for (const o of outs) {
      const seen = new Set<string>(); const q = [o.target]
      while (q.length) {
        const id = q.shift()!
        if (id === join || seen.has(id)) continue
        seen.add(id); branchReach.set(id, (branchReach.get(id) ?? 0) + 1)
        for (const e of outEdges(wf.edges, id)) q.push(e.target)
      }
    }
    const merges = new Set([...branchReach.entries()].filter(([id, c]) => c >= 2 && id !== join).map(([id]) => id))
    const canReach = (from: string, target: string) => {
      const seen = new Set<string>(); const q = outEdges(wf.edges, from).map((e) => e.target)
      while (q.length) {
        const id = q.shift()!
        if (id === target) return true
        if (id === join || seen.has(id)) continue
        seen.add(id)
        for (const e of outEdges(wf.edges, id)) q.push(e.target)
      }
      return false
    }

    type ActiveLane = { start: string; name: string; sub: State }
    let active: ActiveLane[] = outs.map((e, i) => ({ start: e.target, name: names[i], sub: { context: st.context, vars: { ...st.vars }, last: st.last } }))
    const finishedSubs: State[] = []
    const baseLen = st.context.length
    let waveGuard = 0

    while (active.length && waveGuard++ < 30) {
      const byStart = new Map<string, ActiveLane[]>()
      for (const lane of active) { const arr = byStart.get(lane.start) ?? []; arr.push(lane); byStart.set(lane.start, arr) }
      const readyStarts: string[] = []
      const waitingLanes: ActiveLane[] = []
      for (const [startId, group] of byStart.entries()) {
        const otherCanReach = [...byStart.keys()].some((otherId) => otherId !== startId && canReach(otherId, startId))
        if (otherCanReach) waitingLanes.push(...group)
        else readyStarts.push(startId)
      }
      const waveGroups = (readyStarts.length ? readyStarts : [...byStart.keys()]).map((id) => byStart.get(id)!)
      const nextActive: ActiveLane[] = readyStarts.length ? [...waitingLanes] : []

      const waveResults = await Promise.all(waveGroups.map(async (group) => {
        const startId = group[0].start
        let sub: State
        let laneName: string
        if (group.length === 1) {
          sub = group[0].sub; laneName = group[0].name
        } else {
          let ctxText = st.context
          const mergedVars: Record<string, string> = { ...st.vars }
          for (const g of group) {
            ctxText += g.sub.context.slice(baseLen)
            for (const [k, v] of Object.entries(g.sub.vars)) if (!(k in mergedVars) || mergedVars[k] !== v) mergedVars[k] = v
          }
          sub = { context: ctxText, vars: mergedVars, last: group.map((g) => g.sub.last).filter(Boolean).join('\n\n') }
          laneName = nodes.get(startId)?.data.label ?? group.map((g) => g.name).join(' + ')
        }
        let stoppedAt: string | undefined
        const outcome = await walk(startId, sub, {
          depth: opts.depth + 1,
          lane: `Branch: ${laneName}`,
          stopAt: (id) => id === join || (id !== startId && merges.has(id)),
          onStop: (id) => { stoppedAt = id },
        })
        return { outcome, stoppedAt, sub, laneName }
      }))

      if (waveResults.some((r) => r.outcome === 'waiting')) { step.ms = Date.now() - s0; return { outcome: 'waiting' } }
      if (waveResults.some((r) => r.outcome === 'failed') && d.onError !== 'continue') { step.ms = Date.now() - s0; step.status = 'failed'; step.output += '\nA branch failed.'; touch(); return { outcome: 'failed' } }

      for (const r of waveResults) {
        if (r.stoppedAt && r.stoppedAt !== join) nextActive.push({ start: r.stoppedAt, name: r.laneName, sub: r.sub })
        else finishedSubs.push(r.sub)
      }
      active = nextActive
    }

    step.ms = Date.now() - s0
    const seenSnippets = new Set<string>()
    for (const sub of finishedSubs) {
      const delta = sub.context.slice(baseLen)
      if (delta && !seenSnippets.has(delta)) { seenSnippets.add(delta); st.context += delta }
      for (const [k, v] of Object.entries(sub.vars)) if (!(k in st.vars) || st.vars[k] !== v) st.vars[k] = v
    }
    st.last = finishedSubs.map((s) => s.last).filter(Boolean).join('\n\n')
    touch()
    return { outcome: 'done', join }
  }

  /** Walks from a node until the flow ends, a stop point is reached, a step fails or a person is needed. */
  async function walk(startId: string | undefined, st: State, opts: WalkOpts): Promise<Outcome> {
    let cursor: string | undefined = startId; let guardN = 0
    while (cursor && guardN++ < 200) {
      if (opts.stopAt?.(cursor)) { opts.onStop?.(cursor); return 'done' }
      const node = nodes.get(cursor); if (!node) break
      const d = node.data
      if (opts.depth === 0) { run.cursor = cursor; touch() }
      if (d.brick === 'human') {
        if (opts.depth > 0) { run.steps.push({ name: d.label, nodeId: node.id, brick: 'human', ms: 0, status: 'failed', lane: opts.lane, output: 'Approval steps cannot run inside a Repeat or a Split. Move the approval after it.' }); touch(); return 'failed' }
        const approver = ctx.users.find((u) => u.id === d.approver)
        run.steps.push({ name: d.label, nodeId: node.id, brick: 'human', ms: 0, status: 'waiting', output: `Waiting for ${approver?.name ?? 'an approver'} to decide.${d.sub ? `\n\nNote: ${render(d.sub, st.vars)}` : ''}` })
        run.status = 'waiting'; run.approver = d.approver; run.cursor = nextOf(wf.edges, node.id) ?? null; run.context = st.context; run.vars = st.vars
        touch(); ctx.onNotify({ title: `Approval needed: ${wf.name}`, body: run.summary, link: `/runs?open=${run.id}`, kind: 'approval' })
        return 'waiting'
      }
      if (d.brick === 'loop') {
        const out = await runLoop(node, st, opts)
        if (out !== 'done') return out
        cursor = nextOf(wf.edges, node.id, 'done'); continue
      }
      if (d.brick === 'parallel') {
        const { outcome, join } = await runParallel(node, st, opts)
        if (outcome !== 'done') return outcome
        cursor = join; continue
      }
      const { ok, branch } = await runWithRetries(node, st, opts.lane)
      if (!ok) return 'failed'
      cursor = nextOf(wf.edges, node.id, branch)
      if ((d.brick === 'logic' || d.brick === 'classify') && !cursor) { opts.onStop?.(undefined); return 'done' }
    }
    opts.onStop?.(undefined)
    return 'done'
  }

  return { runStep, walk }
}

/** Execute from run.cursor until the run completes, fails or waits at a human gate. Mutates and returns the run. */
export async function execute(run: Run, wf: Workflow, ctx: EngineCtx): Promise<Run> {
  const eng = makeEngine(run, wf, ctx)
  const st: State = { context: run.context ?? `Input:\n${run.input ?? ''}`, vars: { input: run.input ?? '', ...(run.vars ?? {}) }, last: [...run.steps].reverse().find((s) => s.key && s.output && s.status === 'ok')?.output ?? run.input ?? '' }
  run.status = 'running'; ctx.onUpdate({ ...run })
  const t0 = Date.now() - (parseInt(run.duration) || 0) * 1000
  const outcome = await eng.walk(run.cursor ?? startNode(wf)?.id ?? undefined, st, { depth: 0 })
  run.context = st.context; run.vars = st.vars
  if (outcome === 'waiting') { ctx.onUpdate({ ...run }); return run }
  run.duration = `${Math.round((Date.now() - t0) / 1000)}s`; run.finished = now(); run.cursor = null
  if (outcome === 'failed') {
    run.status = 'failed'; ctx.onUpdate({ ...run })
    const failed = [...run.steps].reverse().find((s) => s.status === 'failed')
    ctx.onNotify({ title: `Run failed: ${wf.name}`, body: `${failed?.name ?? 'A step'} · ${(failed?.output ?? '').slice(0, 160)}`, link: `/runs?open=${run.id}`, kind: 'run' })
    return run
  }
  run.status = run.steps.some((s) => s.status === 'waiting') ? 'approved' : 'completed'
  ctx.onUpdate({ ...run })
  return run
}

/** Run a single step of a workflow on its own with the given variables (the builder's "Try this step"). Nothing is recorded. */
export async function runStepOnce(wf: Workflow, nodeId: string, vars: Record<string, string>, ctx: EngineCtx): Promise<RunStep> {
  const node = wf.nodes.find((n) => n.id === nodeId); if (!node) throw new Error('Step not found')
  const run = newRun(wf, vars.input ?? '', 'Try step', 'builder'); run.id = 'try'
  const quiet: EngineCtx = { ...ctx, onUpdate: () => {}, onNotify: () => {} }
  const eng = makeEngine(run, wf, quiet)
  const keys = Object.keys(vars).filter((k) => k !== 'input')
  const st: State = { context: `Input:\n${vars.input ?? ''}${keys.map((k) => `\n\n[${k}]\n${vars[k]}`).join('')}`, vars: { ...vars }, last: keys.length ? vars[keys[keys.length - 1]] : vars.input ?? '' }
  if (node.data.brick === 'loop' || node.data.brick === 'parallel' || node.data.brick === 'human') return { name: node.data.label, nodeId, brick: node.data.brick, ms: 0, status: 'skipped', output: 'Repeat, Split and Approval steps can only be tried in a full test run.' }
  const { step } = await eng.runStep(node, st)
  return step
}

export const summarise = (run: Run) => [...run.steps].reverse().find((s) => (s.brick === 'agent' || s.brick === 'council' || s.brick === 'code' || s.brick === 'flow' || s.brick === 'loop') && s.output && s.status === 'ok')?.output ?? run.summary ?? ''

export const isDue = (wf: Workflow, at = Date.now()) => {
  if (wf.triggerType !== 'schedule' || !wf.schedule || wf.status !== 'live') return false
  const [hh, mm] = wf.schedule.at.split(':').map(Number)
  const d = new Date(at)
  const last = wf.lastRunAt ?? 0
  if (wf.schedule.every === 'hour') {
    const hourFire = new Date(d); hourFire.setMinutes(mm || 0, 0, 0)
    return at >= hourFire.getTime() && last < hourFire.getTime()
  }
  const fire = new Date(d); fire.setHours(hh || 0, mm || 0, 0, 0)
  if (wf.schedule.every === 'week' && d.getDay() !== (wf.schedule.day ?? 1)) return false
  return at >= fire.getTime() && last < fire.getTime()
}

export const watchDue = (wf: Workflow, at = Date.now()) => wf.triggerType === 'watch' && wf.status === 'live' && !!wf.watch?.url && at - (wf.watch.lastCheckedAt ?? 0) >= (wf.watch.every || 60) * 60_000

/** Cheap stable hash of page text, used to detect changes for "When a page changes". */
export const textHash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16) }

/** Rebuild the variables a run had after its first n steps, for re-running from a step. */
export function varsAfter(run: Run, n: number): Record<string, string> {
  const vars: Record<string, string> = { input: run.input ?? '' }
  for (const s of run.steps.slice(0, n)) {
    if (s.status !== 'ok') continue
    if (s.vars) Object.assign(vars, s.vars)
    if (s.key && s.output !== undefined && (!s.lane || s.lane.startsWith('Branch:'))) {
      if (s.vars && s.key in s.vars) vars[s.key] = s.vars[s.key]
      else if (s.brick === 'extract') vars[s.key] = s.output.replace(/^```(?:json)?\s*|\s*```$/g, '')
      else if (s.brick === 'tool' || s.brick === 'http') vars[s.key] = s.output.replace(/^[A-Z]+ \S+\nHTTP \d+\n\n/, '')
      else vars[s.key] = s.output
    }
  }
  return vars
}

export { slug }
