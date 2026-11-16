// Flow builder vocabulary and graph helpers shared by the canvas, inspector, engine and list page.
import { Zap, Sparkles, Users, GitFork, UserCheck, Wrench, Bell, Repeat, Split, Code2, Globe, Workflow as WorkflowIcon, Timer, Braces, ScanSearch, Signpost } from 'lucide-react'
import type { Brick, StepData, WfEdge, WfNode, Workflow } from './data'
import { refs, slug } from './template'

export type BrickInfo = { id: Brick; label: string; tag: string; desc: string; icon: typeof Zap; color: string; soon?: boolean; group: 'Core' | 'Flow' | 'Data' }

export const BRICKS: BrickInfo[] = [
  { id: 'trigger', label: 'Start', tag: 'Start', desc: 'Where the flow begins: by hand, on a schedule, by link or on an event', icon: Zap, color: '#64748b', group: 'Core' },
  { id: 'agent', label: 'Agent', tag: 'Agent', desc: 'An agent works on the input or on what came before', icon: Sparkles, color: '#0ea5e9', group: 'Core' },
  { id: 'human', label: 'Approval', tag: 'Approval', desc: 'Pause until a person decides', icon: UserCheck, color: '#f59e0b', group: 'Core' },
  { id: 'tool', label: 'Action', tag: 'Action', desc: 'Call one ability with arguments from the run', icon: Wrench, color: '#10b981', group: 'Core' },
  { id: 'notify', label: 'Notify', tag: 'Notify', desc: 'Send the latest result as a notification', icon: Bell, color: '#ec4899', group: 'Core' },
  { id: 'logic', label: 'Condition', tag: 'If', desc: 'Branch on a rule or a plain-language check', icon: GitFork, color: '#8b5cf6', group: 'Flow' },
  { id: 'loop', label: 'Repeat for each', tag: 'Repeat', desc: 'Run the next steps once per item in a list', icon: Repeat, color: '#f97316', group: 'Flow' },
  { id: 'parallel', label: 'Split', tag: 'Split', desc: 'Run every outgoing branch at the same time', icon: Split, color: '#14b8a6', group: 'Flow' },
  { id: 'classify', label: 'Route by category', tag: 'Route', desc: 'A model sorts the input into one of your categories; each gets its own branch', icon: Signpost, color: '#a855f7', group: 'Flow' },
  { id: 'wait', label: 'Wait', tag: 'Wait', desc: 'Pause for a number of seconds before the next step', icon: Timer, color: '#64748b', group: 'Flow' },
  { id: 'flow', label: 'Run a workflow', tag: 'Workflow', desc: 'Run another workflow as one step', icon: WorkflowIcon, color: '#6366f1', group: 'Flow' },
  { id: 'set', label: 'Set variables', tag: 'Set', desc: 'Define or reshape variables with templates, no model involved', icon: Braces, color: '#0369a1', group: 'Data' },
  { id: 'extract', label: 'Extract fields', tag: 'Extract', desc: 'Pull named fields out of text into JSON you can reference', icon: ScanSearch, color: '#be185d', group: 'Data' },
  { id: 'code', label: 'Run code', tag: 'Code', desc: 'JavaScript over the variables, no model involved', icon: Code2, color: '#0f766e', group: 'Data' },
  { id: 'http', label: 'Call an API', tag: 'API', desc: 'An HTTP request with the result stored as a variable', icon: Globe, color: '#2563eb', group: 'Data' },
  { id: 'council', label: 'Council', tag: 'Council', desc: 'Several agents deliberate on one case', icon: Users, color: '#6366f1', group: 'Core' },
]
export const brickOf = (b: Brick): BrickInfo => BRICKS.find((x) => x.id === b) ?? BRICKS[1]
/** Steps whose output is stored as a variable */
export const producesVar = (b: Brick) => ['agent', 'council', 'tool', 'code', 'http', 'flow', 'loop', 'extract', 'classify'].includes(b)
/** Outgoing branches of a step that has more than one: [handle id, label] pairs. */
export const branchesOf = (d: StepData): { id: string; label: string }[] => d.brick === 'logic' ? [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] : d.brick === 'loop' ? [{ id: 'each', label: 'Each' }, { id: 'done', label: 'Done' }] : d.brick === 'classify' ? (d.categories ?? []).filter((c) => c.trim()).map((c) => ({ id: c.trim().toLowerCase(), label: c.trim() })) : []
export const keyOf = (d: StepData) => (d.key?.trim() ? slug(d.key) : slug(d.label))

export const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const NODE_W = 232
export const NODE_H = 96
const GAP_X = 56
const GAP_Y = 44

export const outEdges = (edges: WfEdge[], id: string) => edges.filter((e) => e.source === id)
export const nextOf = (edges: WfEdge[], id: string, branch?: string) => {
  const out = outEdges(edges, id)
  if (branch) {
    const b = branch.toLowerCase()
    const hit = out.find((e) => (e.label ?? '').toLowerCase() === b) ?? out.find((e) => (e.label ?? '').toLowerCase().startsWith(b))
    return hit?.target
  }
  return out[0]?.target
}

/** For a Split step: the step where the maximum number of its branches converge again. */
export function joinOf(nodeId: string, edges: WfEdge[]): string | undefined {
  const outs = outEdges(edges, nodeId)
  if (outs.length < 2) return undefined
  const dist = outs.map((e) => {
    const d = new Map<string, number>([[e.target, 0]])
    const q = [e.target]
    while (q.length) { const cur = q.shift()!; for (const n of outEdges(edges, cur)) { if (!d.has(n.target) && n.target !== nodeId) { d.set(n.target, d.get(cur)! + 1); q.push(n.target) } } }
    return d
  })
  const counts = new Map<string, number>()
  dist.forEach((d) => d.forEach((_, id) => counts.set(id, (counts.get(id) ?? 0) + 1)))
  const maxCount = Math.max(0, ...counts.values())
  if (maxCount < 2) return undefined
  const shared = [...counts.entries()].filter(([, c]) => c === maxCount).map(([id]) => id)
  return shared.sort((a, b) => dist.reduce((s, d) => s + (d.get(a) ?? 99), 0) - dist.reduce((s, d) => s + (d.get(b) ?? 99), 0))[0]
}

/** Steps that run inside a loop body or a parallel branch. */
export function nestedNodes(nodes: WfNode[], edges: WfEdge[]): Map<string, 'loop' | 'parallel'> {
  const out = new Map<string, 'loop' | 'parallel'>()
  const walk = (start: string | undefined, stop: Set<string>, kind: 'loop' | 'parallel') => {
    if (!start) return
    const q = [start]; const seen = new Set<string>()
    while (q.length) { const cur = q.shift()!; if (seen.has(cur) || stop.has(cur)) continue; seen.add(cur); out.set(cur, kind); outEdges(edges, cur).forEach((e) => q.push(e.target)) }
  }
  for (const n of nodes) {
    if (n.data.brick === 'loop') walk(nextOf(edges, n.id, 'each'), new Set([n.id, nextOf(edges, n.id, 'done') ?? '']), 'loop')
    if (n.data.brick === 'parallel') { const join = joinOf(n.id, edges); outEdges(edges, n.id).forEach((e) => walk(e.target, new Set([n.id, join ?? '']), 'parallel')) }
  }
  return out
}

/** Longest-path layering from the start node. Children of a condition are ordered yes first, then no; loop bodies before done. */
export function autoLayout(nodes: WfNode[], edges: WfEdge[]): WfNode[] {
  if (nodes.length === 0) return nodes
  const ids = new Set(nodes.map((n) => n.id))
  const incoming = new Map<string, number>(); nodes.forEach((n) => incoming.set(n.id, 0))
  edges.forEach((e) => { if (ids.has(e.source) && ids.has(e.target)) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1) })
  const level = new Map<string, number>()
  const roots = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0)
  const start = nodes.find((n) => n.data.brick === 'trigger') ?? roots[0] ?? nodes[0]
  const order = [start, ...roots.filter((r) => r.id !== start.id)]
  order.forEach((r) => level.set(r.id, 0))
  for (let i = 0; i < nodes.length + 2; i++) {
    let changed = false
    for (const e of edges) {
      if (!level.has(e.source) || !ids.has(e.target)) continue
      const l = (level.get(e.source) ?? 0) + 1
      if ((level.get(e.target) ?? -1) < l) { level.set(e.target, l); changed = true }
    }
    if (!changed) break
  }
  nodes.forEach((n) => { if (!level.has(n.id)) level.set(n.id, 0) })
  const cols = new Map<number, string[]>()
  const rank = new Map<string, number>()
  const sorted = [...nodes].sort((a, b) => (level.get(a.id)! - level.get(b.id)!))
  for (const n of sorted) {
    const parents = edges.filter((e) => e.target === n.id && ids.has(e.source))
    let r = 0
    if (parents.length) r = Math.min(...parents.map((e) => { const base = rank.get(e.source) ?? 0; const lbl = (e.label ?? '').toLowerCase(); return base * 10 + (lbl.startsWith('no') || lbl.startsWith('done') ? 5 : 0) + (edges.filter((x) => x.source === e.source).indexOf(e) % 5) }))
    else r = (cols.get(0)?.length ?? 0) * 10
    rank.set(n.id, r)
    const col = cols.get(level.get(n.id)!) ?? []; col.push(n.id); cols.set(level.get(n.id)!, col)
  }
  const pos = new Map<string, { x: number; y: number }>()
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length))
  const totalH = maxRows * (NODE_H + GAP_Y)
  for (const [l, col] of cols) {
    col.sort((a, b) => (rank.get(a)! - rank.get(b)!))
    const h = col.length * (NODE_H + GAP_Y)
    const y0 = 80 + (totalH - h) / 2
    col.forEach((id, i) => pos.set(id, { x: 60 + l * (NODE_W + GAP_X), y: y0 + i * (NODE_H + GAP_Y) }))
  }
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }))
}

export type Problem = { nodeId?: string; text: string }

export function checkFlow(nodes: WfNode[], edges: WfEdge[], ctx: { hasAgent: (id?: string) => boolean; hasCouncil: (id?: string) => boolean; hasUser: (id?: string) => boolean; hasWorkflow?: (id?: string) => boolean; hasTool?: (name?: string) => boolean; selfId?: string; triggerType?: Workflow['triggerType']; watchUrl?: string }): Problem[] {
  const out: Problem[] = []
  if (nodes.length === 0) return [{ text: 'Add a Start step and at least one more step.' }]
  const triggers = nodes.filter((n) => n.data.brick === 'trigger')
  if (triggers.length === 0) out.push({ text: 'Add a Start step so the flow has a beginning.' })
  if (triggers.length > 1) out.push({ nodeId: triggers[1].id, text: 'Only one Start step is allowed.' })
  if (nodes.length === 1 && triggers.length === 1) out.push({ text: 'Add a step after Start, such as an Agent.' })
  if (ctx.triggerType === 'watch' && !/^https?:\/\//.test(ctx.watchUrl ?? '')) out.push({ nodeId: triggers[0]?.id, text: 'Start: give the page address to watch.' })
  const nested = nestedNodes(nodes, edges)
  const allKnown = new Set(['input', 'item', 'index', 'count', 'now', 'trigger', 'steps', ...nodes.filter((n) => producesVar(n.data.brick)).map((n) => keyOf(n.data)), ...nodes.filter((n) => n.data.brick === 'loop').map((n) => `${keyOf(n.data)}_items`), ...nodes.flatMap((n) => (n.data.assign ?? []).map((a) => slug(a.key)))])
  const seenKeys = new Map<string, string>()
  for (const n of nodes) {
    const d = n.data; const name = d.label || brickOf(d.brick).label
    if (producesVar(d.brick)) {
      const k = keyOf(d)
      if (k) {
        if (seenKeys.has(k)) out.push({ nodeId: n.id, text: `${name}: variable {{${k}}} is already used by "${seenKeys.get(k)}" — rename one of the steps or change its "Stored as" key.` })
        else seenKeys.set(k, name)
      }
    }
    if (d.brick === 'agent' && !ctx.hasAgent(d.agentId) && !d.prompt?.trim()) out.push({ nodeId: n.id, text: `${name}: pick an agent or write what this step should do.` })
    if (d.brick === 'agent' && d.agentId && !ctx.hasAgent(d.agentId)) out.push({ nodeId: n.id, text: `${name}: the agent it used no longer exists.` })
    if (d.brick === 'council' && !ctx.hasCouncil(d.councilId)) out.push({ nodeId: n.id, text: `${name}: pick a council.` })
    if (d.brick === 'human' && !ctx.hasUser(d.approver)) out.push({ nodeId: n.id, text: `${name}: choose who approves.` })
    if (d.brick === 'human' && nested.has(n.id)) out.push({ nodeId: n.id, text: `${name}: approvals cannot sit inside a ${nested.get(n.id) === 'loop' ? 'Repeat' : 'Split'}. Move it after.` })
    if (d.brick === 'logic') {
      if (d.mode === 'rule') { if (!d.rule?.left?.trim()) out.push({ nodeId: n.id, text: `${name}: choose what to check.` }) }
      else if (!d.sub?.trim()) out.push({ nodeId: n.id, text: `${name}: write the condition to check.` })
      const outs = edges.filter((e) => e.source === n.id)
      if (!outs.some((e) => (e.label ?? '').toLowerCase().startsWith('yes'))) out.push({ nodeId: n.id, text: `${name}: connect the Yes branch to a step.` })
    }
    if (d.brick === 'loop') {
      if (!nextOf(edges, n.id, 'each')) out.push({ nodeId: n.id, text: `${name}: connect the Each branch to the step that handles one item.` })
    }
    if (d.brick === 'classify') {
      const cats = branchesOf(d)
      if (cats.length < 2) out.push({ nodeId: n.id, text: `${name}: give at least two categories.` })
      else if (!cats.some((c) => edges.some((e) => e.source === n.id && (e.label ?? '').toLowerCase() === c.id))) out.push({ nodeId: n.id, text: `${name}: connect at least one category to a step.` })
    }
    if (d.brick === 'set' && !(d.assign ?? []).some((a) => a.key.trim())) out.push({ nodeId: n.id, text: `${name}: add at least one variable.` })
    if (d.brick === 'extract' && !(d.fields ?? []).some((f) => f.name.trim())) out.push({ nodeId: n.id, text: `${name}: name at least one field to extract.` })
    if (d.brick === 'parallel' && outEdges(edges, n.id).length < 2) out.push({ nodeId: n.id, text: `${name}: connect at least two branches.` })
    if (d.brick === 'tool' && !d.tool) out.push({ nodeId: n.id, text: `${name}: choose the ability to call.` })
    else if (d.brick === 'tool' && d.tool && ctx.hasTool && !ctx.hasTool(d.tool)) out.push({ nodeId: n.id, text: `${name}: the ability "${d.tool}" was deleted — choose another.` })
    if (d.brick === 'code' && !d.code?.trim()) out.push({ nodeId: n.id, text: `${name}: write the code to run.` })
    if (d.brick === 'http' && !/^https?:\/\/|^\{\{/.test(d.url?.trim() ?? '')) out.push({ nodeId: n.id, text: `${name}: give the address to call.` })
    if (d.brick === 'flow') {
      if (!ctx.hasWorkflow?.(d.workflowId)) out.push({ nodeId: n.id, text: `${name}: pick the workflow to run.` })
      else if (d.workflowId === ctx.selfId) out.push({ nodeId: n.id, text: `${name}: a workflow cannot run itself.` })
    }
    if (d.brick !== 'trigger' && !edges.some((e) => e.target === n.id)) out.push({ nodeId: n.id, text: `${name} is not connected to anything before it.` })
    const avail = new Set(['input', 'now', 'trigger', 'steps', ...varsBefore(nodes, edges, n.id).map((v) => v.key.split('.')[0])])
    for (const tpl of [d.input, d.prompt, d.items, d.url, d.body, d.rule?.left, d.rule?.right, ...(d.assign ?? []).map((a) => a.value)]) {
      for (const r of refs(tpl)) {
        if (!allKnown.has(r)) out.push({ nodeId: n.id, text: `${name}: {{${r}}} is not produced by any step.` })
        else if (!avail.has(r)) {
          if (r === 'item' || r === 'index' || r === 'count') out.push({ nodeId: n.id, text: `${name}: {{${r}}} can only be used inside a Repeat step's Each branch.` })
          else out.push({ nodeId: n.id, text: `${name}: {{${r}}} is not available here — it is produced by a later step or on another branch.` })
        }
      }
    }
  }
  // Detect cycles in connections (excluding edges returning to a Repeat step).
  const visitState = new Map<string, 0 | 1 | 2>()
  const reportedCycles = new Set<string>()
  const dfs = (u: string) => {
    visitState.set(u, 1)
    for (const e of outEdges(edges, u)) {
      const v = e.target
      const vNode = nodes.find((x) => x.id === v)
      if (!vNode) continue
      const st = visitState.get(v) ?? 0
      if (st === 1) {
        if (vNode.data.brick !== 'loop' && !reportedCycles.has(`${u}->${v}`)) {
          reportedCycles.add(`${u}->${v}`)
          const uNode = nodes.find((x) => x.id === u)
          const uName = uNode?.data.label || brickOf(uNode?.data.brick ?? 'agent').label
          const vName = vNode.data.label || brickOf(vNode.data.brick).label
          out.push({ nodeId: u, text: `${uName}: connects back to "${vName}", creating an infinite loop. Use a "Repeat for each" step instead.` })
        }
      } else if (st === 0) {
        dfs(v)
      }
    }
    visitState.set(u, 2)
  }
  for (const n of nodes) if ((visitState.get(n.id) ?? 0) === 0) dfs(n.id)
  return out
}

export const newStep = (brick: Brick, defaults: { model: string; approver?: string }, extra: Partial<StepData> = {}): StepData => ({
  brick, label: brickOf(brick).label, sub: '', retries: 1, timeout: 120, costCap: 0.05, model: defaults.model, onError: 'stop',
  ...(brick === 'human' ? { approver: defaults.approver } : {}),
  ...(brick === 'tool' ? { tool: 'save_document' } : {}),
  ...(brick === 'trigger' ? { label: 'Start', sub: 'Run with an input' } : {}),
  ...(brick === 'logic' ? { mode: 'ai' as const } : {}),
  ...(brick === 'loop' ? { items: '', maxItems: 10 } : {}),
  ...(brick === 'code' ? { code: '// vars holds every variable so far, e.g. vars.input\nreturn vars.input.split("\\n").length + " lines"' } : {}),
  ...(brick === 'http' ? { method: 'GET' as const, url: '', headers: '', body: '' } : {}),
  ...(brick === 'wait' ? { wait: 30 } : {}),
  ...(brick === 'set' ? { assign: [{ key: 'topic', value: '{{input}}' }] } : {}),
  ...(brick === 'extract' ? { fields: [{ name: 'summary', description: 'One-sentence summary' }] } : {}),
  ...(brick === 'classify' ? { categories: ['Question', 'Request', 'Other'] } : {}),
  ...extra,
})

/** One-line plain-language summary of a step for cards and lists. */
export function stepLine(d: StepData, lookup: { agentName?: (id?: string) => string | undefined; userName?: (id?: string) => string | undefined; toolLabel?: (id?: string) => string | undefined; councilName?: (id?: string) => string | undefined; workflowName?: (id?: string) => string | undefined }): string {
  switch (d.brick) {
    case 'trigger': return d.sub || 'Run with an input'
    case 'agent': { const a = lookup.agentName?.(d.agentId); return a ? `${a}${d.prompt ? ' · ' + d.prompt : ''}` : d.prompt || 'Pick an agent or write instructions' }
    case 'logic': return d.mode === 'rule' ? (d.rule?.left ? `${d.rule.left} ${ruleLabel[d.rule.op]} ${d.rule.op === 'empty' || d.rule.op === 'not_empty' ? '' : JSON.stringify(d.rule.right ?? '')}`.trim() : 'Choose what to check') : d.sub?.trim() || 'Write the condition to check'
    case 'human': { const u = lookup.userName?.(d.approver); return u ? `${u} decides` : 'Choose who approves' }
    case 'tool': return lookup.toolLabel?.(d.tool) ?? d.tool ?? 'Choose an ability'
    case 'notify': return 'In-app notification with the latest result'
    case 'council': return lookup.councilName?.(d.councilId) ?? 'Choose a council'
    case 'loop': return d.items?.trim() ? `Items from ${d.items.trim()}` : 'Items extracted from the last result'
    case 'parallel': return 'Every branch runs at once, then they join'
    case 'code': return d.code?.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'))?.trim().slice(0, 60) || 'Write the code to run'
    case 'http': return d.url?.trim() ? `${d.method ?? 'GET'} ${d.url.trim()}` : 'Give the address to call'
    case 'flow': return lookup.workflowName?.(d.workflowId) ?? 'Pick the workflow to run'
    case 'wait': return `Wait ${d.wait ?? 30}s`
    case 'set': return (d.assign ?? []).filter((a) => a.key.trim()).map((a) => `{{${slug(a.key)}}}`).join(', ') || 'Add a variable'
    case 'extract': return (d.fields ?? []).filter((f) => f.name.trim()).map((f) => f.name).join(', ') || 'Name the fields'
    case 'classify': return (d.categories ?? []).filter(Boolean).join(' · ') || 'Give the categories'
  }
}

export const ruleLabel: Record<NonNullable<StepData['rule']>['op'], string> = { contains: 'contains', not_contains: 'does not contain', equals: 'equals', not_equals: 'does not equal', empty: 'is empty', not_empty: 'is not empty', gt: 'is greater than', lt: 'is less than', matches: 'matches pattern' }

/** Variables available to a step: the input, loop variables when nested, and every producing step before it. */
export function varsBefore(nodes: WfNode[], edges: WfEdge[], nodeId: string): { key: string; label: string; brick: Brick | 'builtin' }[] {
  const before = new Set<string>()
  const q = edges.filter((e) => e.target === nodeId).map((e) => e.source)
  while (q.length) { const cur = q.shift()!; if (before.has(cur)) continue; before.add(cur); edges.filter((e) => e.target === cur).forEach((e) => q.push(e.source)) }
  const nested = nestedNodes(nodes, edges)
  // When a step sits after a Repeat step (on its Done branch), variables produced inside the Repeat's Each body are also aggregated into vars.
  for (const n of nodes) {
    if (n.data.brick === 'loop' && before.has(n.id) && nested.get(nodeId) !== 'loop') {
      const eachStart = nextOf(edges, n.id, 'each')
      const doneStart = nextOf(edges, n.id, 'done')
      if (eachStart) {
        const lq = [eachStart]
        while (lq.length) {
          const cur = lq.shift()!
          if (cur === n.id || cur === doneStart || cur === nodeId || before.has(cur)) continue
          before.add(cur)
          outEdges(edges, cur).forEach((e) => lq.push(e.target))
        }
      }
    }
  }
  const out: { key: string; label: string; brick: Brick | 'builtin' }[] = [{ key: 'input', label: 'The run input', brick: 'builtin' }]
  if (nested.get(nodeId) === 'loop') out.push({ key: 'item', label: 'Current item', brick: 'builtin' }, { key: 'index', label: 'Item number', brick: 'builtin' }, { key: 'count', label: 'Number of items', brick: 'builtin' })
  for (const n of nodes) if (before.has(n.id)) {
    if (producesVar(n.data.brick)) out.push({ key: keyOf(n.data), label: n.data.label, brick: n.data.brick })
    if (n.data.brick === 'loop') out.push({ key: `${keyOf(n.data)}_items`, label: `${n.data.label} · items JSON`, brick: 'loop' })
    if (n.data.brick === 'extract') for (const f of n.data.fields ?? []) if (f.name.trim()) out.push({ key: `${keyOf(n.data)}.${slug(f.name)}`, label: `${n.data.label} · ${f.name}`, brick: 'extract' })
    if (n.data.brick === 'set') for (const a of n.data.assign ?? []) if (a.key.trim()) out.push({ key: slug(a.key), label: `${n.data.label} · ${a.key}`, brick: 'set' })
  }
  out.push({ key: 'now', label: 'Date and time', brick: 'builtin' })
  return out
}
