// Flow builder vocabulary and graph helpers shared by the canvas, inspector and list page.
import { Zap, Sparkles, Users, GitFork, UserCheck, Wrench, Bell } from 'lucide-react'
import type { Brick, StepData, WfEdge, WfNode } from './data'

export type BrickInfo = { id: Brick; label: string; desc: string; icon: typeof Zap; color: string; soon?: boolean }

export const BRICKS: BrickInfo[] = [
  { id: 'trigger', label: 'Start', desc: 'Where the flow begins: by hand or on a schedule', icon: Zap, color: '#64748b' },
  { id: 'agent', label: 'Agent', desc: 'An agent works on the context so far', icon: Sparkles, color: '#0ea5e9' },
  { id: 'logic', label: 'Condition', desc: 'Branch on a plain-language check', icon: GitFork, color: '#8b5cf6' },
  { id: 'human', label: 'Approval', desc: 'Pause until a person decides', icon: UserCheck, color: '#f59e0b' },
  { id: 'tool', label: 'Action', desc: 'Call one tool with arguments from the context', icon: Wrench, color: '#10b981' },
  { id: 'notify', label: 'Notify', desc: 'Send the latest result as a notification', icon: Bell, color: '#ec4899' },
  { id: 'council', label: 'Council', desc: 'Several agents deliberate on one case', icon: Users, color: '#6366f1', soon: true },
]
export const brickOf = (b: Brick): BrickInfo => BRICKS.find((x) => x.id === b) ?? BRICKS[1]

export const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export const NODE_W = 224
export const NODE_H = 92
const GAP_X = 72
const GAP_Y = 40

/** Longest-path layering from the start node. Children of a condition are ordered yes first, then no. */
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
  // relax longest paths (graph is small; iterate)
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
  // order within a column: follow parents' order, yes before no
  const cols = new Map<number, string[]>()
  const rank = new Map<string, number>()
  const sorted = [...nodes].sort((a, b) => (level.get(a.id)! - level.get(b.id)!))
  for (const n of sorted) {
    const parents = edges.filter((e) => e.target === n.id && ids.has(e.source))
    let r = 0
    if (parents.length) {
      r = Math.min(...parents.map((e) => { const base = rank.get(e.source) ?? 0; const lbl = (e.label ?? '').toLowerCase(); return base * 10 + (lbl.startsWith('no') ? 5 : 0) }))
    } else r = (cols.get(0)?.length ?? 0) * 10
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

export function checkFlow(nodes: WfNode[], edges: WfEdge[], ctx: { hasAgent: (id?: string) => boolean; hasCouncil: (id?: string) => boolean; hasUser: (id?: string) => boolean }): Problem[] {
  const out: Problem[] = []
  if (nodes.length === 0) return [{ text: 'Add a Start step and at least one more step.' }]
  const triggers = nodes.filter((n) => n.data.brick === 'trigger')
  if (triggers.length === 0) out.push({ text: 'Add a Start step so the flow has a beginning.' })
  if (triggers.length > 1) out.push({ nodeId: triggers[1].id, text: 'Only one Start step is allowed.' })
  if (nodes.length === 1 && triggers.length === 1) out.push({ text: 'Add a step after Start, such as an Agent.' })
  for (const n of nodes) {
    const d = n.data; const name = d.label || brickOf(d.brick).label
    if (d.brick === 'agent' && !ctx.hasAgent(d.agentId) && !d.prompt?.trim()) out.push({ nodeId: n.id, text: `${name}: pick an agent or write what this step should do.` })
    if (d.brick === 'agent' && d.agentId && !ctx.hasAgent(d.agentId)) out.push({ nodeId: n.id, text: `${name}: the agent it used no longer exists.` })
    if (d.brick === 'council' && !ctx.hasCouncil(d.councilId)) out.push({ nodeId: n.id, text: `${name}: pick a council.` })
    if (d.brick === 'human' && !ctx.hasUser(d.approver)) out.push({ nodeId: n.id, text: `${name}: choose who approves.` })
    if (d.brick === 'logic') {
      if (!d.sub?.trim()) out.push({ nodeId: n.id, text: `${name}: write the condition to check.` })
      const outs = edges.filter((e) => e.source === n.id)
      if (!outs.some((e) => (e.label ?? '').toLowerCase().startsWith('yes'))) out.push({ nodeId: n.id, text: `${name}: connect the Yes branch to a step.` })
    }
    if (d.brick === 'tool' && !d.tool) out.push({ nodeId: n.id, text: `${name}: choose the tool to call.` })
    if (d.brick !== 'trigger' && !edges.some((e) => e.target === n.id)) out.push({ nodeId: n.id, text: `${name} is not connected to anything before it.` })
  }
  return out
}

export const newStep = (brick: Brick, defaults: { model: string; approver?: string }, extra: Partial<StepData> = {}): StepData => ({
  brick, label: brickOf(brick).label, sub: '', retries: 1, timeout: 60, costCap: 0.05, model: defaults.model,
  ...(brick === 'human' ? { approver: defaults.approver } : {}), ...(brick === 'tool' ? { tool: 'save_document' } : {}), ...(brick === 'trigger' ? { label: 'Start', sub: 'Run with an input' } : {}),
  ...extra,
})

/** One-line plain-language summary of a step for cards and lists. */
export function stepLine(d: StepData, lookup: { agentName?: (id?: string) => string | undefined; userName?: (id?: string) => string | undefined; toolLabel?: (id?: string) => string | undefined; councilName?: (id?: string) => string | undefined }): string {
  switch (d.brick) {
    case 'trigger': return d.sub || 'Run with an input'
    case 'agent': { const a = lookup.agentName?.(d.agentId); return a ? `${a}${d.prompt ? ' · ' + d.prompt : ''}` : d.prompt || 'Pick an agent or write instructions' }
    case 'logic': return d.sub?.trim() || 'Write the condition to check'
    case 'human': { const u = lookup.userName?.(d.approver); return u ? `${u} decides` : 'Choose who approves' }
    case 'tool': return lookup.toolLabel?.(d.tool) ?? d.tool ?? 'Choose a tool'
    case 'notify': return 'In-app notification with the latest result'
    case 'council': return lookup.councilName?.(d.councilId) ?? 'Coming soon'
  }
}
