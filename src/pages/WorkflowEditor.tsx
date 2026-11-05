// Workflow builder v2: canvas-first with a floating header and toolbar, a searchable palette, a floating inspector,
// a run drawer and a docked Co-Create Assistant panel that proposes changes before applying them.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, type Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Play, Check, Pause, X, Trash2, MoreHorizontal, Download, Copy, LayoutGrid, AlertTriangle, CheckCircle2, Clock, Zap, Sparkles, ArrowUp, ExternalLink, ChevronDown, ChevronRight, Loader2, Hourglass, ThumbsUp, ThumbsDown, History, SlidersHorizontal, ListChecks, Plus, Link2, Eye, FileInput, Wrench, Globe, Workflow as WorkflowIcon, Search, RotateCw, Braces, FlaskConical, Undo2, Redo2, Minus } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates, roleLabel, type Brick, type StepData, type Workflow, type Schedule, type Run, type RunStep, type WfNode, type WfEdge, type TriggerType, type RuleOp } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { CONNECTORS, connectorTool } from '@/lib/connectors'
import { startRun, resumeRun, isRunning, rerunFrom, tryStep, checkWatch } from '@/lib/runner'
import { varsAfter } from '@/lib/engine'
import { parseJsonLoose } from '@/lib/json'
import { BRICKS, brickOf, uid, autoLayout, checkFlow, newStep, stepLine, varsBefore, keyOf, producesVar, nestedNodes, ruleLabel, branchesOf, NODE_W, type Problem } from '@/lib/flow'
import { branchTone } from '@/components/FlowNodes'
import { THINKING, INDEPENDENCE, thinkingOf } from '@/lib/agentVocab'
import { nodeTypes, edgeTypes, type FlowNode, type BranchEdge, type StepStatus, type FlowUi } from '@/components/FlowNodes'
import { Button, Chip, Confirm, Field, Input, Select, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { AgentAvatar } from '@/components/AgentAvatar'
import { AbilityWells, ThinkingMeter } from '@/components/AgentBits'
import { Md } from '@/components/Md'

const DT = 'application/x-cocreate-brick'
const blankUi: FlowUi = { line: '', editable: false }
const branchOf = (brick: Brick | undefined, label?: string): string | undefined => {
  const l = (label ?? '').toLowerCase()
  if (brick === 'logic') return l.startsWith('no') ? 'no' : 'yes'
  if (brick === 'loop') return l.startsWith('done') ? 'done' : 'each'
  if (brick === 'classify') return l || undefined
  return undefined
}
/** Distance from a point to the straight segment between two points. */
const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => { const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) }
const toFlowNodes = (ns: WfNode[]): FlowNode[] => ns.map((n) => ({ id: n.id, type: 'step', position: n.position, data: { ...n.data, ui: blankUi } }))
const toFlowEdges = (es: WfEdge[], ns: WfNode[]): BranchEdge[] => es.map((e) => { const src = ns.find((n) => n.id === e.source)?.data.brick; const label = branchOf(src, e.label); return { id: e.id, source: e.source, target: e.target, type: 'branch', sourceHandle: label, data: { label } } })
const triggerText = (m: Meta) => m.triggerType === 'schedule' ? `Every ${m.schedule.every} at ${m.schedule.at}` : m.triggerType === 'link' ? 'By link' : m.triggerType === 'watch' ? `Page watched every ${m.watch.every >= 60 ? `${m.watch.every / 60}h` : `${m.watch.every}m`}` : m.triggerType === 'event' ? 'When a document is added' : 'By hand'
type Meta = { name: string; description: string; triggerType: TriggerType; schedule: Schedule; watch: NonNullable<Workflow['watch']>; event: NonNullable<Workflow['event']>; autonomy: Workflow['autonomy']; status: Workflow['status']; version: number }

export default function WorkflowEditor() {
  const { workflowId } = useParams()
  const [params] = useSearchParams()
  const user = useUser()!
  const { workflows, councils, users, defaultModel } = useApp()
  const isNew = workflowId === 'new'
  const stored = workflows.find((w) => w.id === workflowId)
  const template = workflowTemplates.find((t) => t.id === (params.get('template') ?? 'standard')) ?? workflowTemplates[0]
  const base = useMemo<Workflow>(() => {
    if (stored) return stored
    const approver = users.find((u) => can(u, 'approve'))?.id
    const nodes = template.id === 'blank' ? [{ id: 't', type: 'step' as const, position: { x: 60, y: 160 }, data: newStep('trigger', { model: defaultModel }) }] : template.nodes.map((n) => ({ ...n, data: { ...n.data, ...(n.data.brick === 'council' && params.get('council') ? { councilId: params.get('council')!, label: councils.find((c) => c.id === params.get('council'))?.name ?? n.data.label } : {}), ...(n.data.brick === 'human' ? { approver } : {}) } }))
    return { id: `wf-${Date.now().toString(36)}`, name: template.id === 'blank' ? 'Untitled workflow' : template.name, description: template.id === 'blank' ? '' : template.desc, status: 'draft', version: 1, triggerType: template.triggerType, schedule: template.schedule, autonomy: 2, nodes: autoLayout(nodes, template.edges), edges: template.edges, updatedAt: '', createdBy: user.id }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!isNew && !stored) return <div className="h-full grid place-items-center muted text-[13px]">This flow no longer exists.</div>
  return <ReactFlowProvider><Editor key={base.id} base={base} stored={stored} isNew={isNew} buildText={params.get('build') ?? ''} /></ReactFlowProvider>
}

type Sel = { kind: 'node' | 'edge'; id: string } | null
type Adding = { after?: string; branch?: string; edge?: string; position?: { x: number; y: number } } | null
type Snap = { nodes: FlowNode[]; edges: BranchEdge[] }
type PlanStep = { brick: Brick; label: string; sub?: string; prompt?: string; agentId?: string; tool?: string; after?: string; branch?: string; approver?: string; wait?: number; assign?: { key: string; value: string }[]; fields?: { name: string; description: string }[]; categories?: string[]; items?: string; code?: string; url?: string; method?: string; input?: string; rule?: StepData['rule'] }
type Plan = { name?: string; description?: string; add: PlanStep[]; remove: string[]; set: { label: string; patch: Partial<StepData> }[] }
type AssistMsg = { role: 'user' | 'assistant'; text: string; plan?: Plan; applied?: boolean }

const RIGHT_W = 340
const TOP_H = 64

function Editor({ base, stored, isNew, buildText }: { base: Workflow; stored?: Workflow; isNew: boolean; buildText: string }) {
  const nav = useNavigate()
  const user = useUser()!
  const store = useApp()
  const { agents, councils, upsertWorkflow, deleteWorkflow, runs, apiKey, defaultModel, users, customTools, profiles, decideRun, workflows, libraries, upsertCustomTool } = store
  const rf = useReactFlow<FlowNode, BranchEdge>()
  const editable = can(user, 'build')
  const approvers = users.filter((u) => can(u, 'approve'))

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(base.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState<BranchEdge>(toFlowEdges(base.edges, base.nodes))
  const [meta, setMeta] = useState<Meta>({ name: base.name, description: base.description, triggerType: base.triggerType, schedule: base.schedule ?? { every: 'day', at: '08:00', input: '' }, watch: base.watch ?? { url: '', every: 60, input: '' }, event: base.event ?? { kind: 'document_added' }, autonomy: base.autonomy, status: base.status, version: base.version })
  const [sel, setSel] = useState<Sel>(null)
  const [adding, setAdding] = useState<Adding>(null)
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(!!buildText)
  const [flowTab, setFlowTab] = useState<'setup' | 'checks' | 'history'>('setup')
  const [runInput, setRunInput] = useState(base.schedule?.input || base.watch?.input || '')
  const [testRunId, setTestRunId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [assist, setAssist] = useState<{ input: string; busy: boolean; log: AssistMsg[] }>({ input: '', busy: false, log: [] })
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const builtRef = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => { const el = canvasRef.current; if (el) setSize({ w: el.clientWidth, h: el.clientHeight }) }, [])

  // ---------- derived ----------
  const plain = useCallback((): { nodes: WfNode[]; edges: WfEdge[] } => ({ nodes: nodes.map((n) => { const { ui: _ui, ...data } = n.data; return { id: n.id, type: 'step', position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data } }), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label })) }), [nodes, edges])
  const current = useCallback((): Workflow => ({ ...base, ...meta, schedule: meta.triggerType === 'schedule' ? meta.schedule : undefined, watch: meta.triggerType === 'watch' ? { ...(stored?.watch ?? {}), ...meta.watch } : undefined, event: meta.triggerType === 'event' ? meta.event : undefined, ...plain(), updatedAt: new Date().toISOString().slice(0, 10) }), [base, meta, plain, stored])
  const strip = (w: Workflow) => JSON.stringify({ ...w, updatedAt: '', version: 0, lastRunAt: 0, status: '', watch: w.watch ? { url: w.watch.url, every: w.watch.every, input: w.watch.input } : undefined })
  const dirty = strip(current()) !== strip(stored ?? base) || (isNew && !stored)
  const problems = useMemo<Problem[]>(() => { const p = plain(); return checkFlow(p.nodes, p.edges, { hasAgent: (id) => !!id && agents.some((a) => a.id === id), hasCouncil: (id) => !!id && councils.some((c) => c.id === id), hasUser: (id) => !!id && users.some((u) => u.id === id), hasWorkflow: (id) => !!id && workflows.some((w) => w.id === id), selfId: base.id, triggerType: meta.triggerType, watchUrl: meta.watch.url }) }, [plain, agents, councils, users, workflows, base.id, meta.triggerType, meta.watch.url])
  const wfRuns = useMemo(() => runs.filter((r) => r.workflowId === base.id), [runs, base.id])
  const liveRun = useMemo(() => (testRunId ? runs.find((r) => r.id === testRunId) : wfRuns.find((r) => r.status === 'running' || r.status === 'waiting')) ?? null, [runs, testRunId, wfRuns])
  const statusOf = useMemo(() => {
    const m = new Map<string, StepStatus>()
    if (!liveRun) return m
    for (const s of liveRun.steps) { const id = s.nodeId ?? nodes.find((n) => n.data.label === s.name)?.id; if (id) m.set(id, s.status === 'ok' ? 'ok' : s.status === 'failed' ? (s.continued ? 'ok' : 'failed') : s.status === 'waiting' ? 'waiting' : 'skipped') }
    if (liveRun.status === 'running' && liveRun.cursor) m.set(liveRun.cursor, 'running')
    if (liveRun.status === 'waiting') { const w = liveRun.steps.find((s) => s.status === 'waiting'); const id = w?.nodeId ?? nodes.find((n) => n.data.label === w?.name)?.id; if (id) m.set(id, 'waiting') }
    return m
  }, [liveRun, nodes])
  const nested = useMemo(() => { const p = plain(); return nestedNodes(p.nodes, p.edges) }, [plain])
  const selectedNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined
  const selectedEdge = sel?.kind === 'edge' ? edges.find((e) => e.id === sel.id) : undefined
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? ''
  const lookup = useMemo(() => ({ agentName: (id?: string) => agents.find((a) => a.id === id)?.name, userName: (id?: string) => users.find((u) => u.id === id)?.name, toolLabel: (id?: string) => TOOLS.find((t) => t.name === id)?.label ?? customTools.find((t) => t.name === id)?.label, councilName: (id?: string) => councils.find((c) => c.id === id)?.name, workflowName: (id?: string) => workflows.find((w) => w.id === id)?.name }), [agents, users, customTools, councils, workflows])
  const lineFor = useCallback((d: StepData) => {
    if (d.brick === 'trigger') return meta.triggerType === 'manual' ? d.sub || 'Run with an input' : meta.triggerType === 'watch' ? (meta.watch.url || 'Give the page address to watch') : triggerText(meta)
    if (!['logic', 'loop', 'code', 'http', 'flow', 'parallel', 'wait', 'set', 'extract', 'classify'].includes(d.brick) && d.sub?.trim()) return d.sub
    return stepLine(d, lookup)
  }, [meta, lookup])

  // ---------- graph ops ----------
  const select = (s: Sel) => { setSel(s); setAdding(null); setPalette(false) }
  // ---------- history (undo / redo) ----------
  const latest = useRef<Snap>({ nodes, edges }); latest.current = { nodes, edges }
  const history = useRef<{ past: Snap[]; future: Snap[]; lastPatch: number }>({ past: [], future: [], lastPatch: 0 })
  const commit = useCallback(() => { const h = history.current; h.past = [...h.past.slice(-49), latest.current]; h.future = [] }, [])
  const restore = (snap: Snap) => { setNodes(snap.nodes); setEdges(snap.edges); setSel(null) }
  const undo = useCallback(() => { const h = history.current; const prev = h.past.pop(); if (!prev) return; h.future.push(latest.current); restore(prev) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => { const h = history.current; const next = h.future.pop(); if (!next) return; h.past.push(latest.current); restore(next) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const addStep = useCallback((brick: Brick, opts: { after?: string; branch?: string; edge?: string; position?: { x: number; y: number }; extra?: Partial<StepData> } = {}) => {
    if (brick === 'trigger' && nodes.some((n) => n.data.brick !== undefined && n.data.brick === 'trigger')) return
    commit()
    const edge = opts.edge ? edges.find((e) => e.id === opts.edge) : undefined
    const after = edge ? nodes.find((n) => n.id === edge.source) : opts.after ? nodes.find((n) => n.id === opts.after) : undefined
    const branchWanted = edge ? edge.data?.label : opts.branch ?? (after?.data.brick === 'classify' ? after.data.categories?.[0]?.toLowerCase() : undefined)
    const id = uid()
    const siblings = after ? edges.filter((e) => e.source === after.id).length : 0
    const tgt = edge ? nodes.find((n) => n.id === edge.target) : undefined
    const position = opts.position ?? (edge && after && tgt ? { x: (after.position.x + tgt.position.x) / 2, y: (after.position.y + tgt.position.y) / 2 + 60 } : after ? { x: after.position.x + NODE_W + 92, y: after.position.y + (opts.branch === 'no' || opts.branch === 'done' ? 150 : opts.branch === 'yes' || opts.branch === 'each' ? -40 : after.data.brick === 'parallel' ? siblings * 140 - 70 : 0) } : { x: 60 + nodes.length * 40, y: 160 + nodes.length * 30 })
    const data: StepData = { ...newStep(brick, { model: defaultModel, approver: approvers[0]?.id }, opts.extra), ...(opts.extra?.agentId ? { label: agents.find((a) => a.id === opts.extra!.agentId)?.name ?? brickOf(brick).label } : {}) }
    setNodes((ns) => [...ns, { id, type: 'step', position, data: { ...data, ui: blankUi } }])
    if (after) setEdges((es) => wire(es, after, id, brick, branchWanted))
    setSel({ kind: 'node', id }); setAdding(null); setPalette(false)
    setTimeout(() => ensureVisible(position), 20)
    return id
  }, [nodes, edges, defaultModel, approvers, agents, setNodes, setEdges, commit]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Duplicate the selected step next to itself, unconnected. */
  const duplicateNode = useCallback((id: string) => {
    const n = nodes.find((x) => x.id === id); if (!n || n.data.brick === 'trigger') return
    commit(); const nid = uid()
    setNodes((ns) => [...ns, { ...n, id: nid, selected: false, position: { x: n.position.x + 48, y: n.position.y + 72 }, data: { ...n.data, label: `${n.data.label} copy`, key: undefined } }])
    setSel({ kind: 'node', id: nid })
  }, [nodes, setNodes, commit])
  /** Dragging a connection out and dropping it on empty canvas opens the palette to add the next step there. */
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: { isValid: boolean | null; fromNode: { id: string } | null; fromHandle: { id?: string | null } | null }) => {
    if (state.isValid || !state.fromNode || !editable) return
    const pt = 'changedTouches' in event ? event.changedTouches[0] : (event as MouseEvent)
    const p = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY })
    setAdding({ after: state.fromNode.id, branch: state.fromHandle?.id ?? undefined, position: { x: p.x, y: p.y - 40 } }); setSel({ kind: 'node', id: state.fromNode.id }); setPalette(true)
  }, [editable, rf])
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    const src = nodes.find((n) => n.id === c.source); const tgt = nodes.find((n) => n.id === c.target)
    if (!src || !tgt || tgt.data.brick === 'trigger') return
    const branch = branchOf(src.data.brick, c.sourceHandle ?? undefined)
    commit()
    setEdges((es) => es.some((e) => e.source === c.source && e.target === c.target) ? es : [...es, { id: `e${uid()}`, source: c.source!, target: c.target!, type: 'branch', sourceHandle: branch, data: { label: branch } }])
  }, [nodes, setEdges, commit])
  /** Connect a new step after `from`. If `from` already continues on that branch, the new step is inserted into the chain. */
  const wire = (es: BranchEdge[], from: FlowNode, newId: string, newBrick: Brick, branch?: string): BranchEdge[] => {
    const label = branchOf(from.data.brick, branch)
    const existing = from.data.brick === 'parallel' ? undefined : es.find((e) => e.source === from.id && (e.data?.label ?? undefined) === label)
    let out = es
    if (existing && newBrick !== 'parallel') { const nl = branchOf(newBrick, undefined); out = out.map((e) => (e.id === existing.id ? { ...e, source: newId, sourceHandle: nl, data: { label: nl } } : e)) }
    return [...out, { id: `e${uid()}`, source: from.id, target: newId, type: 'branch', sourceHandle: label, data: { label } }]
  }
  const removeNode = (id: string) => { commit(); setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); setSel(null) }
  const removeEdge = (id: string) => { commit(); setEdges((es) => es.filter((e) => e.id !== id)); setSel(null) }
  const flipEdge = (id: string) => { commit(); setEdges((es) => es.map((e) => { if (e.id !== id || !e.data?.label) return e; const l = e.data.label; const nl = l === 'yes' ? 'no' : l === 'no' ? 'yes' : l === 'each' ? 'done' : 'each'; return { ...e, sourceHandle: nl, data: { label: nl } } })) }
  const patch = (id: string, p: Partial<StepData>) => { if (Date.now() - history.current.lastPatch > 1200) { commit(); history.current.lastPatch = Date.now() } setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n))) }
  const ensureVisible = (p: { x: number; y: number }) => {
    const vp = rf.getViewport(); const cw = (canvasRef.current?.clientWidth ?? 800) - RIGHT_W - 24; const ch = canvasRef.current?.clientHeight ?? 600
    let { x, y } = vp
    const sx = p.x * vp.zoom + vp.x, sy = p.y * vp.zoom + vp.y, w = NODE_W * vp.zoom, h = 100 * vp.zoom
    if (sx + w > cw - 24) x = cw - 24 - (p.x + NODE_W) * vp.zoom; else if (sx < 80) x = 80 - p.x * vp.zoom
    if (sy + h > ch - 24) y = ch - 24 - (p.y + 100) * vp.zoom; else if (sy < TOP_H + 16) y = TOP_H + 16 - p.y * vp.zoom
    if (x !== vp.x || y !== vp.y) rf.setViewport({ x, y, zoom: vp.zoom }, { duration: 300 })
  }
  const viewportFor = useCallback((ns: { position: { x: number; y: number } }[], full: { w: number; h: number }) => {
    const left = 72, top = TOP_H + 12, right = RIGHT_W + 24, bottom = 24
    const size = { w: Math.max(200, full.w - left - right), h: Math.max(200, full.h - top - bottom) }
    if (!ns.length) return { x: left + 40, y: top + 40, zoom: 1 }
    const minX = Math.min(...ns.map((n) => n.position.x)), maxX = Math.max(...ns.map((n) => n.position.x + NODE_W))
    const minY = Math.min(...ns.map((n) => n.position.y)), maxY = Math.max(...ns.map((n) => n.position.y + 110))
    const pad = 36
    const zoom = Math.min(1, Math.max(0.5, Math.min((size.w - pad * 2) / (maxX - minX), (size.h - pad * 2) / (maxY - minY))))
    const gw = (maxX - minX) * zoom, gh = (maxY - minY) * zoom
    const x = left + (gw < size.w - pad * 2 ? (size.w - gw) / 2 - minX * zoom : pad - minX * zoom)
    const y = top + (gh < size.h - pad * 2 ? (size.h - gh) / 2 - minY * zoom : pad - minY * zoom)
    return { x, y, zoom }
  }, [])
  const focus = useCallback((ns: { position: { x: number; y: number } }[], animate = false) => {
    const el = canvasRef.current; if (!el || !ns.length) return
    rf.setViewport(viewportFor(ns, { w: el.clientWidth, h: el.clientHeight }), { duration: animate ? 350 : 0 })
  }, [rf, viewportFor])
  const arrange = useCallback((ns?: FlowNode[], es?: BranchEdge[]) => {
    const srcN = ns ?? nodes; const srcE = es ?? edges
    if (!ns) commit()
    const laid = autoLayout(srcN.map((n) => { const { ui: _ui, ...data } = n.data; return { id: n.id, type: 'step' as const, position: n.position, data } }), srcE.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label })))
    setNodes((cur) => cur.map((n) => ({ ...n, position: laid.find((l) => l.id === n.id)?.position ?? n.position })))
    setTimeout(() => focus(laid, true), 30)
  }, [nodes, edges, setNodes, focus, commit])

  // ---------- persistence ----------
  const persist = (status?: Workflow['status']) => {
    const w: Workflow = { ...current(), status: status ?? meta.status, version: stored ? meta.version + 1 : 1 }
    upsertWorkflow(w); setMeta((m) => ({ ...m, status: w.status, version: w.version }))
    if (isNew) nav(`/workflows/${w.id}`, { replace: true })
    return w
  }
  const duplicate = () => { const w: Workflow = { ...current(), id: `wf-${Date.now().toString(36)}`, name: `${meta.name} copy`, status: 'draft', version: 1, lastRunAt: undefined }; upsertWorkflow(w); nav(`/workflows/${w.id}`) }
  const exportJson = () => { const blob = new Blob([JSON.stringify(current(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${meta.name.replace(/\s+/g, '-').toLowerCase()}.workflow.json`; a.click(); URL.revokeObjectURL(a.href) }
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editable && currentLocation.pathname !== nextLocation.pathname && (isNew && !stored ? nodes.length > 1 && !nextLocation.pathname.startsWith('/workflows/wf-') : dirty))
  const blocked = blocker.state === 'blocked' ? blocker : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (editable && dirty) persist() }
      if (e.key === 'Escape') { setSel(null); setAdding(null); setMenu(false); setPalette(false) }
      if (typing || !editable) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); if (sel?.kind === 'node') duplicateNode(sel.id) }
      if (e.key === 'Tab' && !palette) { e.preventDefault(); setPalette(true) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- running ----------
  const startTest = async () => {
    if (!runInput.trim() || problems.length) return
    const w = dirty || isNew ? persist() : (stored ?? current())
    setStarting(true); setSel(null); setDrawer(true)
    await startRun(w, runInput.trim(), 'Manual · builder', (id) => { setTestRunId(id); setStarting(false) })
    setStarting(false)
  }
  const decide = async (r: Run, d: 'approved' | 'rejected') => { decideRun(r.id, d); if (d === 'approved' && r.cursor) await resumeRun(r.id) }
  const again = async (r: Run, step: number) => { setDrawer(true); await rerunFrom(r.id, step, (id) => setTestRunId(id)) }

  // ---------- assistant ----------
  const flowSummary = useCallback(() => nodes.map((n) => `- ${n.data.brick}:"${n.data.label}"${producesVar(n.data.brick) ? ` → {{${keyOf(n.data)}}}` : ''}${n.data.prompt ? ` (${n.data.prompt.slice(0, 80)})` : n.data.sub ? ` (${n.data.sub.slice(0, 80)})` : ''}`).join('\n') + '\nConnections: ' + edges.map((e) => `${nameOf(e.source)}${e.data?.label ? `[${e.data.label}]` : ''}→${nameOf(e.target)}`).join(', '), [nodes, edges]) // eslint-disable-line react-hooks/exhaustive-deps
  const applyPlan = useCallback((plan: Plan, msgIndex: number) => {
    commit()
    let ns = [...nodes]; let es = [...edges]
    const find = (label?: string) => ns.find((n) => n.data.label.toLowerCase() === (label ?? '').toLowerCase())
    for (const lbl of plan.remove ?? []) { const n = find(lbl); if (n && n.data.brick !== 'trigger') { ns = ns.filter((x) => x.id !== n.id); es = es.filter((e) => e.source !== n.id && e.target !== n.id) } }
    for (const s of plan.set ?? []) { const n = find(s.label); if (n) ns = ns.map((x) => (x.id === n.id ? { ...x, data: { ...x.data, ...s.patch } } : x)) }
    const terminal = () => { const t = ns.filter((n) => !es.some((e) => e.source === n.id) && n.data.brick !== 'parallel'); return t[t.length - 1] ?? ns[ns.length - 1] }
    let prev: FlowNode | undefined = terminal()
    for (const s of plan.add ?? []) {
      const id = uid()
      const agent = s.agentId ? agents.find((a) => a.id === s.agentId) : undefined
      const tool = s.tool && [...TOOLS, ...customTools].some((t) => t.name === s.tool) ? s.tool : undefined
      const approver = s.approver ? approvers.find((u) => u.name.toLowerCase() === String(s.approver).toLowerCase() || u.email.toLowerCase() === String(s.approver).toLowerCase() || u.id === s.approver || u.name.toLowerCase().includes(String(s.approver).toLowerCase()))?.id : undefined
      const data: StepData = { ...newStep(s.brick, { model: defaultModel, approver: approver ?? approvers[0]?.id }), label: String(s.label || brickOf(s.brick).label).slice(0, 40), sub: s.brick === 'logic' && !s.rule ? String(s.sub ?? s.prompt ?? '') : s.brick === 'human' ? String(s.sub ?? '') : '', prompt: s.brick === 'agent' || s.brick === 'tool' ? (s.prompt ? String(s.prompt) : undefined) : undefined, ...(agent ? { agentId: agent.id, model: agent.model } : {}), ...(s.brick === 'tool' ? { tool: tool ?? 'save_document' } : {}), ...(s.brick === 'logic' && s.rule ? { mode: 'rule' as const, rule: s.rule } : {}), ...(s.items ? { items: s.items } : {}), ...(s.code ? { code: s.code } : {}), ...(s.url ? { url: s.url, method: (s.method as StepData['method']) ?? 'GET' } : {}), ...(s.input ? { input: s.input } : {}), ...(s.wait ? { wait: Number(s.wait) || 30 } : {}), ...(Array.isArray(s.assign) ? { assign: s.assign.filter((a: any) => a && typeof a.key === 'string').map((a: any) => ({ key: a.key, value: String(a.value ?? '') })) } : {}), ...(Array.isArray(s.fields) ? { fields: s.fields.filter((f: any) => f && typeof f.name === 'string').map((f: any) => ({ name: f.name, description: String(f.description ?? '') })) } : {}), ...(Array.isArray(s.categories) ? { categories: s.categories.filter((c: unknown) => typeof c === 'string') } : {}) }
      const from = s.after === 'end' || !s.after ? prev : find(s.after) ?? prev
      const node: FlowNode = { id, type: 'step', position: { x: 0, y: 0 }, data: { ...data, ui: blankUi } }
      ns = [...ns, node]
      if (from) es = wire(es, from, id, s.brick, s.branch)
      prev = node
    }
    setNodes(ns); setEdges(es)
    if (plan.name || plan.description) setMeta((m) => ({ ...m, name: plan.name && (m.name === 'Untitled workflow' || m.name === 'New workflow' || m.name === 'Blank') ? plan.name.slice(0, 60) : m.name, description: plan.description && !m.description ? plan.description.slice(0, 160) : m.description }))
    setTimeout(() => arrange(ns, es), 20)
    setAssist((a) => ({ ...a, log: a.log.map((m, i) => (i === msgIndex ? { ...m, applied: true } : m)) }))
    setSel(null); setFlowTab('checks')
  }, [nodes, edges, agents, customTools, defaultModel, approvers, setNodes, setEdges, arrange, commit])
  const runAssistant = useCallback(async (text: string) => {
    const q = text.trim(); if (!q || !apiKey) return
    setAssist((a) => ({ input: '', busy: true, log: [...a.log, { role: 'user', text: q }] }))
    const last = wfRuns[0]
    const lastRun = last ? `Last run ${last.id}: ${last.status}. Steps: ${last.steps.map((s) => `${s.name}=${s.status}${s.status === 'failed' ? ` (${(s.output ?? '').slice(0, 200)})` : ''}`).join('; ')}` : 'No runs yet.'
    const sys = `You are the Co-Create Assistant inside a workflow builder. Be brief and concrete; the person is a colleague. You can answer questions about the flow or propose changes.
Steps available: agent (AI does work; "prompt" = instructions; optional "agentId"), logic (condition; either "sub" plain-language check judged by a model, or "rule": {"left":"{{var}}","op":"contains|not_contains|equals|not_equals|empty|not_empty|gt|lt|matches","right":"text"}; the step after it on "yes" runs when true; add a step with "branch":"no" for the other path), human (a person approves; the run pauses; "approver" = the person's name from: ${approvers.map((u) => u.name).join(', ')}; "sub" = note), tool (call one ability: ${TOOLS.filter((t) => t.category !== 'Reasoning').map((t) => t.name).join(', ')}${customTools.length ? ', ' + customTools.map((t) => t.name).join(', ') : ''}; "prompt" = guidance), notify (in-app notification), loop (repeat for each item; "items" = template like "{{input}}" or empty to extract from the last result; the step after it on "each" handles one item and may use {{item}}; the step on "done" runs after all items; the loop's results are {{<loop key>}}), parallel (every outgoing step runs at once; they join at the first step they all connect to), code (JavaScript, "code" with vars.* available, return a value), http ("url", "method"), flow (run another workflow), wait ("wait" seconds), set ("assign": [{"key":"name","value":"template"}], no model), extract ("fields": [{"name","description"}]; result is JSON at {{key.field}}), classify ("categories": ["A","B"]; a model picks one; the step after it with "branch":"A" runs for that category).
Every producing step stores its result as {{key}} where key is the label in snake_case; a step may set "input" to a template such as "Topic: {{input}}\\n\\n{{research}}" to receive only that instead of everything so far. Labels are 1-3 words and unique.
Available agents: ${agents.map((a) => `${a.id} = ${a.name} (${a.description})`).join('; ') || 'none, so leave agentId out and write prompts'}. Other workflows: ${workflows.filter((w) => w.id !== base.id).map((w) => w.name).join(', ') || 'none'}. Knowledge libraries: ${libraries.map((l) => l.name).join(', ')}.
Current flow "${meta.name}":\n${flowSummary()}\n${lastRun}
Reply with ONE JSON object and nothing else, no prose before or after: {"reply":"one to three short sentences for the person","changes":{"name":"only when the flow is untitled","description":"optional","add":[{"brick":"agent|logic|human|tool|notify|loop|parallel|code|http|flow|wait|set|extract|classify","label":"...","after":"label of the step it follows or \\"end\\"","branch":"yes|no|each|done (only after logic or loop)","prompt":"...","sub":"...","agentId":"...","tool":"...","approver":"...","items":"...","code":"...","url":"...","input":"..."}],"remove":["labels to delete"],"set":[{"label":"existing label","patch":{"prompt":"...","sub":"...","label":"..."}}]}}. Leave "changes" out when only answering. Added steps chain in order: the first follows "after", each next one follows the previous added step unless it names its own "after". A step added after X is inserted between X and whatever X led to, so "before Y" means after the step that precedes Y.`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, ...assist.log.slice(-6).map((m) => ({ role: m.role, content: m.text })), { role: 'user' as const, content: q }], temperature: 0 })) { if (ev.type === 'delta') acc += ev.text; if (ev.type === 'usage') store.recordSpend(ev.usage.cost ?? 0) }
      const j = parseJsonLoose(acc)
      const c = j.changes
      const add: PlanStep[] = Array.isArray(c?.add) ? c.add.filter((s: any) => ['agent', 'logic', 'human', 'tool', 'notify', 'loop', 'parallel', 'code', 'http', 'flow', 'wait', 'set', 'extract', 'classify'].includes(s.brick)) : []
      const plan: Plan | undefined = c && (add.length || c.remove?.length || c.set?.length) ? { name: typeof c.name === 'string' ? c.name : undefined, description: typeof c.description === 'string' ? c.description : undefined, add, remove: Array.isArray(c.remove) ? c.remove.filter((x: unknown) => typeof x === 'string') : [], set: Array.isArray(c.set) ? c.set.filter((x: any) => x && typeof x.label === 'string' && x.patch && typeof x.patch === 'object') : [] } : undefined
      setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: String(j.reply ?? (plan ? 'Here is what I would change.' : 'Done.')), plan }] }))
      if (plan && nodes.filter((n) => n.data.brick !== 'trigger').length === 0 && buildText && !builtRef.current) { builtRef.current = true; setTimeout(() => setAssist((a) => { const i = a.log.length - 1; applyPlan(plan, i); return a }), 10) }
    } catch { setAssist((a) => ({ ...a, busy: false, log: [...a.log, { role: 'assistant', text: acc.slice(0, 400) || 'I could not turn that into steps. Try describing it as a sequence: research X, then check Y, then ask Z to approve.' }] })) }
  }, [apiKey, assist.log, agents, customTools, workflows, libraries, base.id, meta.name, flowSummary, wfRuns, defaultModel, store, nodes, buildText, applyPlan])
  const seeded = useRef(false)
  useEffect(() => { if (buildText && !seeded.current && apiKey) { seeded.current = true; runAssistant(buildText) } }, [buildText, apiKey, runAssistant])

  // ---------- drag and drop ----------
  const onDragOver = (e: DragEvent) => { if (e.dataTransfer.types.includes(DT)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) } }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const raw = e.dataTransfer.getData(DT); if (!raw) return; const { brick, extra } = JSON.parse(raw) as { brick: Brick; extra?: Partial<StepData> }; const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }); const hit = edgeNear(p); if (hit) addStep(brick, { edge: hit, extra }); else addStep(brick, { position: { x: p.x - NODE_W / 2, y: p.y - 40 }, extra }) }
  /** The connection closest to a canvas point, when within reach. */
  const edgeNear = (p: { x: number; y: number }) => { let best: { id: string; d: number } | null = null; for (const e of edges) { const a = nodes.find((n) => n.id === e.source); const b = nodes.find((n) => n.id === e.target); if (!a || !b) continue; const d = segDist(p, { x: a.position.x + NODE_W, y: a.position.y + 52 }, { x: b.position.x, y: b.position.y + 52 }); if (d < 34 && (!best || d < best.d)) best = { id: e.id, d } } return best?.id }
  const onPaneDouble = (e: React.MouseEvent) => { if (!editable || !(e.target as HTMLElement).classList?.contains('react-flow__pane')) return; const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }); setSel(null); setAdding({ position: { x: p.x - NODE_W / 2, y: p.y - 40 } }); setPalette(true) }

  // ---------- render data ----------
  const rfNodes = useMemo<FlowNode[]>(() => nodes.map((n) => {
    const a = n.data.brick === 'agent' && n.data.agentId ? agents.find((x) => x.id === n.data.agentId) : undefined
    const ui: FlowUi = { line: lineFor(n.data), status: statusOf.get(n.id), problem: problems.some((p) => p.nodeId === n.id), editable, nested: nested.get(n.id), onAdd: editable ? (id, branch) => { setAdding({ after: id, branch }); setSel({ kind: 'node', id }); setPalette(true) } : undefined,
      agent: a ? { name: a.name, icon: a.icon, color: a.color, thinking: thinkingOf({ model: a.model }, profiles, defaultModel)?.label } : undefined,
      approver: n.data.brick === 'human' ? users.find((u) => u.id === n.data.approver)?.name : undefined,
      trigger: n.data.brick === 'trigger' ? { kind: meta.triggerType, text: triggerText(meta) } : undefined }
    return { ...n, selected: sel?.kind === 'node' && sel.id === n.id, data: { ...n.data, ui } }
  }), [nodes, agents, lineFor, statusOf, problems, editable, profiles, defaultModel, users, meta, sel, nested])
  const rfEdges = useMemo<BranchEdge[]>(() => edges.map((e) => ({ ...e, selected: sel?.kind === 'edge' && sel.id === e.id, data: { ...e.data, active: statusOf.get(e.source) === 'ok' && (statusOf.get(e.target) === 'running'), editable, onDelete: removeEdge, onFlip: flipEdge, onInsert: (id) => { const e = edges.find((x) => x.id === id); if (!e) return; setAdding({ after: e.source, branch: e.data?.label, edge: id }); setSel({ kind: 'edge', id }); setPalette(true) } } })), [edges, sel, statusOf, editable]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusTone = meta.status === 'live' ? 'ok' : meta.status === 'paused' ? 'warn' : undefined
  const showRight = !!selectedNode || !!selectedEdge || !assistantOpen
  const addTarget = (): { after?: string; branch?: string; edge?: string; position?: { x: number; y: number } } => adding ? { after: adding.after, branch: adding.branch, edge: adding.edge, position: adding.position } : selectedNode ? { after: selectedNode.id, branch: selectedNode.data.brick === 'logic' ? 'yes' : selectedNode.data.brick === 'loop' ? 'each' : selectedNode.data.brick === 'classify' ? selectedNode.data.categories?.[0]?.toLowerCase() : undefined } : { after: [...nodes].reverse().find((n) => !edges.some((e) => e.source === n.id) && n.data.brick !== 'parallel')?.id }
  const lastRun = wfRuns[0]
  const sampleVars = useMemo(() => (lastRun ? varsAfter(lastRun, lastRun.steps.length) : { input: runInput }), [lastRun, runInput])

  return (
    <div className="h-full flex gap-3">
      <div ref={canvasRef} className={cx('flex-1 min-w-0 clay relative overflow-hidden transition-all', dragOver && 'drop-hint')} onDragOver={onDragOver} onDragLeave={() => setDragOver(false)} onDrop={onDrop} onDoubleClick={onPaneDouble}>
        {size && <ReactFlow<FlowNode, BranchEdge> defaultViewport={viewportFor(nodes, size)} nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd as any} onNodeDragStart={() => commit()} connectionRadius={36} elevateNodesOnSelect
          onNodeClick={(_, n) => select({ kind: 'node', id: n.id })} onEdgeClick={(_, e) => select({ kind: 'edge', id: e.id })} onPaneClick={() => { setSel(null); setAdding(null); setPalette(false); setMenu(false) }}
          onNodesDelete={(ds) => { if (ds.some((d) => d.id === sel?.id)) setSel(null) }} onEdgesDelete={(ds) => { if (ds.some((d) => d.id === sel?.id)) setSel(null) }}
          minZoom={0.3} maxZoom={1.6} proOptions={{ hideAttribution: true }}
          nodesDraggable={editable} nodesConnectable={editable} elementsSelectable deleteKeyCode={editable ? ['Backspace', 'Delete'] : null} selectionOnDrag={false} panOnScroll zoomOnDoubleClick={false} snapToGrid snapGrid={[12, 12]} defaultEdgeOptions={{ type: 'branch' }}>
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--muted)" style={{ opacity: 0.28 }} />
          <Controls showInteractive={false} position="bottom-right" style={{ right: showRight ? RIGHT_W + 12 : 0, bottom: drawer ? 300 : 12 }} />
          {nodes.length > 4 && !drawer && <MiniMap pannable zoomable position="bottom-left" nodeColor={(n) => brickOf((n.data as FlowNode['data']).brick).color} nodeStrokeWidth={0} maskColor="transparent" style={{ width: 150, height: 84, marginLeft: 64 }} />}
        </ReactFlow>}
        {nodes.length <= 1 && !palette && (
          <div className="absolute inset-x-0 bottom-10 grid place-items-center pointer-events-none" style={{ paddingRight: showRight ? RIGHT_W : 0 }}>
            <div className="text-center max-w-[360px]">
              <div className="text-[13.5px] font-semibold">Build the workflow</div>
              <div className="text-[12.5px] muted mt-1 leading-relaxed">Press <b>+</b> or <b>Tab</b> for steps, abilities and connectors; drag a connection out of Start and drop it; double-click the canvas; or open the assistant and describe the whole flow.</div>
            </div>
          </div>
        )}

        {/* ---------- floating header ---------- */}
        <header className="absolute top-3 left-3 right-3 h-12 glass rounded-[16px] px-2.5 flex items-center gap-2 z-30">
          <button onClick={() => nav('/workflows')} className="btn btn-ghost btn-sm btn-icon" title="Back to workflows"><ArrowLeft size={16} /></button>
          <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={!editable} placeholder="Name this workflow" aria-label="Workflow name" className="display font-bold text-[14.5px] bg-transparent outline-0 w-[140px] lg:w-[220px] truncate rounded-md px-1.5 hover:bg-[var(--clay-dark)] focus:bg-[var(--clay-dark)] transition-colors" />
          <Chip tone={statusTone as any} className="whitespace-nowrap shrink-0">{meta.status === 'live' ? 'Live' : meta.status === 'paused' ? 'Paused' : 'Draft'} · v{meta.version}</Chip>
          {dirty && <span className="text-[11.5px] muted whitespace-nowrap hidden lg:inline">Unsaved</span>}
          <div className="flex-1" />
          <button onClick={() => { setSel(null); setFlowTab('checks') }} className={cx('chip !h-8 hover:text-[var(--text)] whitespace-nowrap shrink-0', problems.length ? 'chip-warn' : 'chip-ok')}>{problems.length ? <><AlertTriangle size={12} /> {problems.length} to fix</> : <><CheckCircle2 size={12} /> Ready</>}</button>
          <button onClick={() => arrange()} className="btn btn-ghost btn-sm btn-icon" title="Tidy up the layout"><LayoutGrid size={15} /></button>
          {editable && <Button size="sm" onClick={() => persist()} disabled={!dirty}><Check size={13} /> Save</Button>}
          <Button size="sm" variant="primary" onClick={() => { setSel(null); setDrawer(!drawer) }} disabled={problems.length > 0 && !drawer} title={problems[0]?.text}><Play size={13} /> {drawer ? 'Hide run' : 'Test run'}</Button>
          {editable && (meta.status === 'live' ? <Button size="sm" onClick={() => persist('paused')}><Pause size={13} /> Pause</Button> : <Button size="sm" onClick={() => persist('live')} disabled={problems.length > 0} title={problems[0]?.text}>Publish</Button>)}
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="btn btn-ghost btn-sm btn-icon" aria-label="More actions" aria-expanded={menu}><MoreHorizontal size={16} /></button>
            <AnimatePresence>{menu && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-2 w-[220px] pop rounded-[14px] p-1.5 z-40" onMouseLeave={() => setMenu(false)}>
                {editable && <button onClick={() => { setMenu(false); duplicate() }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
                <button onClick={() => { setMenu(false); exportJson() }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Download size={14} /> Export JSON</button>
                {stored && editable && <><div className="h-px bg-[var(--line)] my-1" /><button onClick={() => { setMenu(false); setConfirmDelete(true) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] text-[var(--danger)] hover:bg-[var(--clay-dark)]"><Trash2 size={14} /> Delete workflow</button></>}
              </motion.div>
            )}</AnimatePresence>
          </div>
        </header>

        {/* ---------- left toolbar ---------- */}
        {editable && (
          <div className="absolute left-3 top-[68px] w-11 glass rounded-[14px] p-1 flex flex-col gap-1 z-30">
            <button onClick={() => { setPalette(!palette); if (!palette) setAdding(null) }} className={cx('btn btn-ghost btn-icon !w-9 !h-9', palette && 'bg-[var(--surface-2)] text-[var(--text)]')} title="Add a step" aria-label="Add a step" aria-expanded={palette}><Plus size={18} /></button>
            <button onClick={() => setAssistantOpen(!assistantOpen)} className={cx('btn btn-ghost btn-icon !w-9 !h-9', assistantOpen && 'bg-[var(--surface-2)] text-[var(--accent-ink)]')} title="Co-Create Assistant" aria-label="Co-Create Assistant" aria-expanded={assistantOpen}><Sparkles size={17} /></button>
            <button onClick={() => { setSel(null); setDrawer(!drawer) }} className={cx('btn btn-ghost btn-icon !w-9 !h-9 relative', drawer && 'bg-[var(--surface-2)] text-[var(--text)]')} title="Runs" aria-label="Runs"><History size={17} />{liveRun?.status === 'running' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />}</button>
            <div className="h-px bg-[var(--line)] mx-1 my-0.5" />
            <button onClick={undo} className="btn btn-ghost btn-icon !w-9 !h-9" title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
            <button onClick={redo} className="btn btn-ghost btn-icon !w-9 !h-9" title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Redo2 size={16} /></button>
          </div>
        )}
        <AnimatePresence>{palette && editable && (
          <Palette key="palette" onClose={() => { setPalette(false); setAdding(null) }} adding={adding} nameOf={nameOf} hasTrigger={nodes.some((n) => n.data.brick === 'trigger')} customTools={customTools} workflows={workflows.filter((w) => w.id !== base.id)}
            onPick={(brick, extra) => addStep(brick, { ...addTarget(), extra })} onConnector={(c) => { let t = customTools.find((x) => x.name === c.name); if (!t) { t = connectorTool(c, user.id); upsertCustomTool(t) } addStep('tool', { ...addTarget(), extra: { tool: t.name, label: c.label } }) }} />
        )}</AnimatePresence>

        {/* ---------- right panel ---------- */}
        {showRight && <aside className="absolute right-3 top-[68px] bottom-3 glass rounded-[18px] flex flex-col min-h-0 overflow-hidden z-20" style={{ width: RIGHT_W }}>
          {selectedNode ? (
            <StepInspector key={selectedNode.id} node={selectedNode} editable={editable} onClose={() => setSel(null)} onRemove={() => removeNode(selectedNode.id)} patch={(p) => patch(selectedNode.id, p)} meta={meta} setMeta={setMeta} edges={edges} nodes={nodes} onAdd={(branch) => { setAdding({ after: selectedNode.id, branch }); setPalette(true) }} onSelect={(id) => select({ kind: 'node', id })} store={{ agents, councils, users, approvers, customTools, profiles, defaultModel, workflows: workflows.filter((w) => w.id !== base.id), libraries }} stored={stored} wfForTry={current} sampleVars={sampleVars} nested={nested.get(selectedNode.id)} onSaveFirst={() => persist()} />
          ) : selectedEdge ? (
            <div className="flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><span className="text-[13px] font-semibold flex-1">Connection</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSel(null)} aria-label="Close"><X size={14} /></button></div>
              <div className="p-4 flex flex-col gap-3 text-[13px]">
                <div><b>{nameOf(selectedEdge.source)}</b> <span className="muted">→</span> <b>{nameOf(selectedEdge.target)}</b></div>
                {selectedEdge.data?.label && <Field label="Branch" hint="Which outcome of the step before follows this connection."><Segmented value={selectedEdge.data.label} onChange={() => flipEdge(selectedEdge.id)} items={selectedEdge.data.label === 'yes' || selectedEdge.data.label === 'no' ? [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] : [{ id: 'each', label: 'Each item' }, { id: 'done', label: 'When done' }]} /></Field>}
                {editable && <Button onClick={() => removeEdge(selectedEdge.id)}><Trash2 size={13} /> Remove connection</Button>}
              </div>
            </div>
          ) : (
            <FlowPanel tab={flowTab} setTab={setFlowTab} meta={meta} setMeta={setMeta} editable={editable} problems={problems} onProblem={(p) => p.nodeId && select({ kind: 'node', id: p.nodeId })} runs={wfRuns} onPickRun={(id) => { setTestRunId(id); setDrawer(true) }} onStart={() => { const t = nodes.find((n) => n.data.brick === 'trigger'); if (t) select({ kind: 'node', id: t.id }) }} />
          )}
        </aside>}

        {/* ---------- run drawer ---------- */}
        <AnimatePresence>{drawer && (
          <motion.div key="drawer" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.2 }} className="absolute left-[64px] bottom-3 glass rounded-[18px] z-20 flex flex-col overflow-hidden" style={{ right: showRight ? RIGHT_W + 24 : 12, height: 288 }}>
            <RunDrawer run={liveRun} runs={wfRuns} input={runInput} setInput={setRunInput} onStart={startTest} starting={starting} problems={problems} apiKey={!!apiKey} dirty={dirty || isNew} canApprove={can(user, 'approve')} onDecide={decide} onPick={(id) => setTestRunId(id)} onReset={() => setTestRunId(null)} onClose={() => setDrawer(false)} nodes={nodes} onAgain={again} onSelectNode={(id) => select({ kind: 'node', id })} />
          </motion.div>
        )}</AnimatePresence>
        <AnimatePresence>{liveRun && liveRun.status === 'running' && !drawer && (
          <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => { setSel(null); setDrawer(true) }} className="absolute bottom-4 left-1/2 -translate-x-1/2 glass rounded-full h-9 pl-3 pr-4 flex items-center gap-2 text-[12.5px] font-medium z-20" style={{ marginLeft: showRight ? -RIGHT_W / 2 : 0 }}><Loader2 size={13} className="animate-spin accent-ink" /> Running · {liveRun.cursor ? nameOf(liveRun.cursor) || `step ${liveRun.steps.length + 1}` : `step ${liveRun.steps.length + 1}`}</motion.button>
        )}</AnimatePresence>
      </div>

      {/* ---------- assistant panel ---------- */}
      <AnimatePresence initial={false}>{assistantOpen && (
        <motion.aside key="assistant" initial={{ width: 0, opacity: 0 }} animate={{ width: 380, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="shrink-0 overflow-hidden">
          <AssistantPanel log={assist.log} busy={assist.busy} input={assist.input} setInput={(v) => setAssist((a) => ({ ...a, input: v }))} onSend={runAssistant} onApply={applyPlan} onClose={() => setAssistantOpen(false)} apiKey={!!apiKey} empty={nodes.filter((n) => n.data.brick !== 'trigger').length === 0} lastRun={lastRun} problems={problems} nameOf={nameOf} />
        </motion.aside>
      )}</AnimatePresence>

      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${meta.name}?`} danger confirmLabel="Delete" body="Past runs stay under Runs. Schedules stop." onConfirm={() => { if (stored) deleteWorkflow(stored.id); nav('/workflows') }} />
      <Confirm open={!!blocked} onClose={() => blocked?.reset()} title="Leave without saving?" body="Your changes to this workflow will be lost." confirmLabel="Leave" danger onConfirm={() => blocked?.proceed()} />
    </div>
  )
}

/* ================= palette ================= */
function Palette({ onClose, adding, nameOf, hasTrigger, customTools, workflows, onPick, onConnector }: { onClose: () => void; adding: Adding; nameOf: (id: string) => string; hasTrigger: boolean; customTools: ReturnType<typeof useApp.getState>['customTools']; workflows: Workflow[]; onPick: (brick: Brick, extra?: Partial<StepData>) => void; onConnector: (c: (typeof CONNECTORS)[number]) => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'steps' | 'abilities' | 'connectors' | 'workflows'>('steps')
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase())
  const drag = (e: DragEvent, brick: Brick, extra?: Partial<StepData>) => { e.dataTransfer.setData(DT, JSON.stringify({ brick, extra })); e.dataTransfer.effectAllowed = 'move' }
  const abilities = [...TOOLS.filter((t) => t.category !== 'Reasoning').map((t) => ({ name: t.name, label: t.label, desc: t.desc, gated: t.write })), ...customTools.map((t) => ({ name: t.name, label: t.label, desc: t.description, gated: false }))]
  const all = q.trim().length > 0
  const branchWord = (b?: string) => (b === 'yes' ? 'Yes' : b === 'no' ? 'No' : b === 'each' ? 'Each item' : b === 'done' ? 'When done' : b ? b.charAt(0).toUpperCase() + b.slice(1) : '')
  return (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.15 }} className="absolute left-[62px] top-[68px] bottom-3 w-[330px] glass rounded-[18px] z-30 flex flex-col overflow-hidden">
      <div className="p-3 pb-2 flex flex-col gap-2 border-b hairline">
        <div className="flex items-center gap-2">
          <div className="relative flex-1"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 muted" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search steps, abilities, connectors" aria-label="Search" className="input !h-9 !pl-8 !text-[12.5px]" /></div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-icon" aria-label="Close"><X size={14} /></button>
        </div>
        {adding?.edge ? <div className="text-[11.5px] leading-snug px-0.5">Inserting into the connection after <b>{nameOf(adding.after!)}</b>{adding.branch && <> on <b>{branchWord(adding.branch)}</b></>}.</div> : adding?.after ? <div className="text-[11.5px] leading-snug px-0.5">Adding after <b>{nameOf(adding.after)}</b>{adding.branch && <> on <b>{branchWord(adding.branch)}</b></>}.</div> : adding?.position ? <div className="text-[11.5px] leading-snug px-0.5">Adding at the spot you chose. Connect it afterwards.</div> : <div className="text-[11.5px] muted leading-snug px-0.5">Click to add after the selected step, or drag onto the canvas.</div>}
        {!all && <Segmented value={tab} onChange={setTab} items={[{ id: 'steps', label: 'Steps' }, { id: 'abilities', label: 'Abilities' }, { id: 'connectors', label: 'Connectors' }, { id: 'workflows', label: 'Flows' }]} />}
      </div>
      <div className="flex-1 min-h-0 scroll p-2 flex flex-col gap-1">
        {(all || tab === 'steps') && (['Core', 'Flow', 'Data'] as const).map((g) => { const list = BRICKS.filter((b) => b.group === g && (match(b.label) || match(b.desc))); if (!list.length) return null; return (
          <div key={g} className="mb-1"><div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 py-1.5">{g === 'Core' ? 'Steps' : g === 'Flow' ? 'Flow control' : 'Data'}</div>
            {list.map((b) => { const disabled = b.soon || (b.id === 'trigger' && hasTrigger); return (
              <button key={b.id} disabled={disabled} draggable={!disabled} onDragStart={(e) => drag(e, b.id)} onClick={() => onPick(b.id)} aria-label={b.soon ? `${b.label} (coming soon)` : `Add ${b.label} step`} className={cx('brick-card w-full flex items-center gap-2.5 px-2 h-11 rounded-[11px] text-left hover:bg-[var(--clay-dark)]', disabled && 'opacity-50 cursor-not-allowed')}>
                <Tile color={b.color} size={28} radius={8}><b.icon size={13} /></Tile>
                <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[12.5px] font-semibold">{b.label}{b.soon && <span className="chip !h-[18px] !text-[10px] !px-1.5">Soon</span>}{b.id === 'trigger' && hasTrigger && <span className="chip !h-[18px] !text-[10px] !px-1.5">Added</span>}</span><span className="block text-[11px] muted leading-snug truncate">{b.desc}</span></span>
              </button>
            ) })}
          </div>
        ) })}
        {(all || tab === 'abilities') && (() => { const list = abilities.filter((a) => match(a.label) || match(a.desc)); if (!list.length) return null; return (
          <div className="mb-1"><div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 py-1.5">Abilities · one call as an Action step</div>
            {list.map((a) => <button key={a.name} draggable onDragStart={(e) => drag(e, 'tool', { tool: a.name, label: a.label })} onClick={() => onPick('tool', { tool: a.name, label: a.label })} className="brick-card w-full flex items-center gap-2.5 px-2 h-11 rounded-[11px] text-left hover:bg-[var(--clay-dark)]"><Tile color={a.gated ? '#f59e0b' : '#10b981'} size={28} radius={8}><Wrench size={13} /></Tile><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold truncate">{a.label}{a.gated ? <span className="muted font-normal"> · asks a person</span> : ''}</span><span className="block text-[11px] muted leading-snug truncate">{a.desc}</span></span></button>)}
          </div>
        ) })()}
        {(all || tab === 'connectors') && (() => { const list = CONNECTORS.filter((c) => match(c.label) || match(c.description) || match(c.category)); if (!list.length) return null; return (
          <div className="mb-1"><div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 py-1.5">Connectors · public APIs, added as an ability</div>
            {list.map((c) => <button key={c.id} onClick={() => onConnector(c)} className="w-full flex items-center gap-2.5 px-2 h-11 rounded-[11px] text-left hover:bg-[var(--clay-dark)]"><Tile color="#2563eb" size={28} radius={8}><Globe size={13} /></Tile><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold truncate">{c.label} <span className="muted font-normal">· {c.category}</span></span><span className="block text-[11px] muted leading-snug truncate">{c.description}</span></span>{customTools.some((t) => t.name === c.name) && <Check size={13} className="accent-ink shrink-0" />}</button>)}
          </div>
        ) })()}
        {(all || tab === 'workflows') && (() => { const list = workflows.filter((w) => match(w.name) || match(w.description)); return (
          <div className="mb-1"><div className="text-[10.5px] font-semibold uppercase tracking-wider muted px-2 py-1.5">Workflows · run as one step</div>
            {list.length === 0 && <div className="text-[12px] muted px-2 py-3">{q ? 'No workflow matches.' : 'No other workflows yet.'}</div>}
            {list.map((w) => <button key={w.id} draggable onDragStart={(e) => drag(e, 'flow', { workflowId: w.id, label: w.name })} onClick={() => onPick('flow', { workflowId: w.id, label: w.name })} className="brick-card w-full flex items-center gap-2.5 px-2 h-11 rounded-[11px] text-left hover:bg-[var(--clay-dark)]"><Tile color="#6366f1" size={28} radius={8}><WorkflowIcon size={13} /></Tile><span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold truncate">{w.name}</span><span className="block text-[11px] muted leading-snug truncate">{w.description || `${w.nodes.length} steps`} · {w.status}</span></span></button>)}
          </div>
        ) })()}
      </div>
    </motion.div>
  )
}

/* ================= assistant panel ================= */
function AssistantPanel({ log, busy, input, setInput, onSend, onApply, onClose, apiKey, empty, lastRun, problems, nameOf }: { log: AssistMsg[]; busy: boolean; input: string; setInput: (v: string) => void; onSend: (t: string) => void; onApply: (p: Plan, i: number) => void; onClose: () => void; apiKey: boolean; empty: boolean; lastRun?: Run; problems: Problem[]; nameOf: (id: string) => string }) {
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [log.length, busy])
  const failed = lastRun?.status === 'failed' ? [...lastRun.steps].reverse().find((s) => s.status === 'failed') : undefined
  const suggestions = empty
    ? ['Research a competitor every Monday, summarise what changed and notify me if prices moved', 'For each product line in the input, look up recent news and build one table', 'Compare three vendors in parallel, then draft a recommendation for approval']
    : [...(failed ? [`Why did ${failed.name} fail and how do I fix it?`] : []), ...(problems.length ? ['Fix the open checks'] : []), 'Add an approval before the last step', 'Explain this workflow in plain words']
  return (
    <div className="clay h-full w-[380px] flex flex-col min-h-0">
      <div className="h-12 px-4 flex items-center gap-2 border-b hairline shrink-0"><span className="w-7 h-7 rounded-[9px] grid place-items-center text-white" style={{ background: 'linear-gradient(145deg,#1a4a73,#10385b)' }}><Sparkles size={14} /></span><span className="text-[13px] font-semibold flex-1">Co-Create Assistant</span><button onClick={onClose} className="btn btn-ghost btn-sm btn-icon" aria-label="Close assistant"><X size={14} /></button></div>
      <div className="flex-1 min-h-0 scroll p-3 flex flex-col gap-2.5">
        {log.length === 0 && <div className="text-[12.5px] muted leading-relaxed px-1 pt-1">{empty ? 'Describe the whole workflow and I will lay out the steps. You can then ask me to change, extend or explain it.' : 'Ask me to add or change steps, fix the checks, or explain what happened in the last run.'}</div>}
        {log.map((m, i) => (
          <div key={i} className={cx('text-[12.5px] leading-relaxed', m.role === 'user' ? 'self-end max-w-[88%] px-3 py-2 rounded-[14px] rounded-br-[5px] bg-[var(--surface-2)] border hairline whitespace-pre-wrap' : 'self-start max-w-[95%] px-1')}>
            {m.role === 'assistant' ? <Md className="prose-chat">{m.text}</Md> : m.text}
            {m.plan && (
              <div className={cx('flat mt-2 p-3', m.applied && 'opacity-70')}>
                <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1.5">{m.applied ? 'Applied' : 'Proposed changes'}</div>
                <ul className="flex flex-col gap-1 text-[12px]">
                  {m.plan.name && <li>Name it <b>{m.plan.name}</b></li>}
                  {m.plan.remove.map((r) => <li key={`r${r}`} className="text-[var(--danger)]">− Remove {r}</li>)}
                  {m.plan.set.map((s) => <li key={`s${s.label}`}>~ Change <b>{s.label}</b>{s.patch.label ? ` → ${s.patch.label}` : ''}</li>)}
                  {m.plan.add.map((a, j) => { const b = brickOf(a.brick); return <li key={j} className="flex items-center gap-1.5"><Tile color={b.color} size={16} radius={5}><b.icon size={9} /></Tile><span>+ <b>{a.label}</b> <span className="muted">· {b.label}{a.after && a.after !== 'end' ? ` after ${a.after}` : ''}{a.branch ? ` on ${a.branch}` : ''}</span></span></li> })}
                </ul>
                {!m.applied && <div className="flex gap-2 mt-2.5"><Button size="sm" variant="primary" onClick={() => onApply(m.plan!, i)}><Check size={12} /> Apply</Button><Button size="sm" variant="ghost" onClick={() => setInput('Change that: ')}>Change it</Button></div>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[12px] muted px-1"><Loader2 size={13} className="animate-spin" /> Thinking…</div>}
        <div ref={bottom} />
      </div>
      <div className="p-3 pt-2 border-t hairline flex flex-col gap-2 shrink-0">
        {!busy && <div className="flex flex-wrap gap-1.5">{suggestions.slice(0, 3).map((s) => <button key={s} onClick={() => onSend(s)} disabled={!apiKey} className="chip hover:text-[var(--text)] !h-7 text-left max-w-full"><span className="truncate">{s}</span></button>)}</div>}
        <div className="flat p-1.5 pl-3 flex items-end gap-1.5 focus-within:border-[var(--accent)]">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(input) } }} rows={2} disabled={!apiKey || busy} placeholder={apiKey ? (empty ? 'Describe the workflow…' : 'Tell me what to build or change…') : 'Models are not available right now'} aria-label="Message the assistant" className="flex-1 bg-transparent outline-0 text-[12.5px] resize-none leading-snug py-1.5" />
          <button aria-label="Send" onClick={() => onSend(input)} disabled={!input.trim() || busy || !apiKey} className="btn btn-primary btn-sm btn-icon !rounded-full shrink-0 mb-0.5"><ArrowUp size={14} /></button>
        </div>
        {lastRun && <div className="text-[11px] muted px-1">Knows this flow and run {lastRun.id} ({lastRun.status}{failed ? ` at ${failed.name}` : ''}).</div>}
      </div>
    </div>
  )
}

/* ================= right panel: flow ================= */
function FlowPanel({ tab, setTab, meta, setMeta, editable, problems, onProblem, runs, onPickRun, onStart }: { tab: 'setup' | 'checks' | 'history'; setTab: (t: 'setup' | 'checks' | 'history') => void; meta: Meta; setMeta: (m: Meta) => void; editable: boolean; problems: Problem[]; onProblem: (p: Problem) => void; runs: Run[]; onPickRun: (id: string) => void; onStart: () => void }) {
  const TI = { manual: Zap, schedule: Clock, link: Link2, watch: Eye, event: FileInput }[meta.triggerType]
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 border-b hairline">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'setup', label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={12} /> Workflow</span> }, { id: 'checks', label: <span className="inline-flex items-center gap-1.5">{problems.length ? <AlertTriangle size={12} className="text-[var(--warn)]" /> : <CheckCircle2 size={12} className="text-[var(--ok)]" />} Checks{problems.length ? ` · ${problems.length}` : ''}</span> }, { id: 'history', label: <span className="inline-flex items-center gap-1.5"><History size={12} /> Runs{runs.length ? ` · ${runs.length}` : ''}</span> }]} />
      </div>
      <div className="p-4 flex flex-col gap-4 scroll">
        {tab === 'setup' && (
          <fieldset disabled={!editable} className="flex flex-col gap-4">
            <Field label="What this workflow does" hint="Shown in the list and to people who approve its steps."><Textarea rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="e.g. Research a topic, draft a brief and ask for sign-off" /></Field>
            <div>
              <div className="text-[12px] font-semibold mb-1.5">How it starts</div>
              <button type="button" onClick={onStart} className="flat w-full p-3 flex items-center gap-2.5 text-left hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))]"><Tile color="#64748b" size={28} radius={8}><TI size={13} /></Tile><span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold">{triggerText(meta)}</span><span className="block text-[11px] muted truncate">{meta.triggerType === 'watch' ? meta.watch.url || 'No page set yet' : meta.triggerType === 'schedule' ? meta.schedule.input || 'No input set yet' : 'Change it on the Start step'}</span></span><ChevronRight size={14} className="muted" /></button>
            </div>
            <div className="flat p-3 text-[12px] muted leading-relaxed">Each step stores its result as a variable, for example <code className="text-[11px]">{'{{research}}'}</code>, that later steps can use. Approval steps pause the run until the person decides.</div>
          </fieldset>
        )}
        {tab === 'checks' && (
          problems.length === 0 ? <div className="py-10 text-center"><CheckCircle2 size={28} className="text-[var(--ok)] mx-auto" /><div className="text-[13px] font-semibold mt-2">Ready to run</div><div className="text-[12px] muted mt-1">Every step is connected and set up.</div></div> : (
            <div className="flex flex-col gap-1.5">
              <div className="text-[12px] muted mb-1">Fix these before publishing or running.</div>
              {problems.map((p, i) => <button key={i} onClick={() => onProblem(p)} disabled={!p.nodeId} className="flat p-3 text-left text-[12.5px] flex items-start gap-2 hover:border-[color-mix(in_srgb,var(--warn)_50%,var(--line))] disabled:cursor-default"><AlertTriangle size={13} className="text-[var(--warn)] mt-0.5 shrink-0" /><span className="flex-1">{p.text}</span>{p.nodeId && <ChevronRight size={13} className="muted mt-0.5" />}</button>)}
            </div>
          )
        )}
        {tab === 'history' && (
          runs.length === 0 ? <div className="py-10 text-center text-[12.5px] muted">No runs yet. Use Test run to try the workflow.</div> : (
            <div className="flex flex-col gap-1.5">{runs.slice(0, 40).map((r) => <RunRow key={r.id} r={r} onClick={() => onPickRun(r.id)} />)}</div>
          )
        )}
      </div>
    </div>
  )
}

const runTone = (s: Run['status']) => (s === 'waiting' ? 'warn' : s === 'failed' || s === 'rejected' ? 'danger' : s === 'running' ? 'accent' : 'ok') as 'warn' | 'danger' | 'accent' | 'ok'
const runLabel: Record<Run['status'], string> = { running: 'Running', waiting: 'Waiting', approved: 'Approved', rejected: 'Rejected', failed: 'Failed', completed: 'Done' }
function RunRow({ r, onClick }: { r: Run; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flat p-3 text-left hover:bg-[var(--surface)]">
      <div className="flex items-center gap-2 text-[12.5px]"><span className="font-semibold tabular-nums">{r.id}</span><Chip tone={runTone(r.status)}>{runLabel[r.status]}</Chip><span className="muted ml-auto text-[11.5px]">{r.started.slice(5)}</span></div>
      <div className="text-[12px] muted truncate mt-1">{r.trigger} · {r.summary}</div>
    </button>
  )
}

/* ================= run drawer ================= */
function RunDrawer({ run, runs, input, setInput, onStart, starting, problems, apiKey, dirty, canApprove, onDecide, onPick, onReset, onClose, nodes, onAgain, onSelectNode }: { run: Run | null; runs: Run[]; input: string; setInput: (v: string) => void; onStart: () => void; starting: boolean; problems: Problem[]; apiKey: boolean; dirty: boolean; canApprove: boolean; onDecide: (r: Run, d: 'approved' | 'rejected') => void; onPick: (id: string) => void; onReset: () => void; onClose: () => void; nodes: FlowNode[]; onAgain: (r: Run, step: number) => void; onSelectNode: (id: string) => void }) {
  const nav = useNavigate()
  const [open, setOpen] = useState<number | null>(null)
  const [tab, setTab] = useState<'steps' | 'vars' | 'history'>('steps')
  useEffect(() => { if (run) { setOpen(run.steps.length - 1); setTab('steps') } }, [run?.id, run?.steps.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tick, setTick] = useState(0)
  useEffect(() => { setTick(0); if (run?.status !== 'running') return; const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i) }, [run?.status, run?.id, run?.steps.length])
  const elapsed = run ? (run.status === 'running' ? `${(parseInt(run.duration) || 0) + tick}s` : run.duration) : ''
  const cursorNode = run?.status === 'running' && run.cursor ? nodes.find((n) => n.id === run.cursor) : undefined
  const waitingStep = run?.status === 'waiting' ? run.steps.find((s) => s.status === 'waiting') : undefined
  const approverName = run?.approver ? useApp.getState().users.find((u) => u.id === run.approver)?.name : undefined
  const finished = !!run && (run.status === 'completed' || run.status === 'failed' || run.status === 'rejected' || (run.status === 'approved' && !run.cursor))
  const sel = run && open !== null ? run.steps[open] : undefined
  const tone = (s: RunStep) => (s.status === 'ok' ? 'var(--ok)' : s.status === 'failed' ? (s.continued ? 'var(--warn)' : 'var(--danger)') : s.status === 'waiting' ? 'var(--warn)' : 'var(--muted)')
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-3 h-11 border-b hairline flex items-center gap-2 shrink-0">
        {run ? <><Chip tone={runTone(run.status)}>{run.status === 'running' ? <Loader2 size={11} className="animate-spin" /> : null} {runLabel[run.status]}</Chip><span className="text-[12px] muted tabular-nums">{run.id} · {elapsed}{run.cost ? ` · $${run.cost.toFixed(3)}` : ''}{run.rerunOf ? ` · again from step ${run.rerunOf.step + 1} of ${run.rerunOf.runId}` : ''}</span></> : <span className="text-[13px] font-semibold flex items-center gap-1.5"><Play size={13} /> Test run</span>}
        <div className="flex-1" />
        {run && <Segmented value={tab} onChange={setTab} items={[{ id: 'steps', label: 'Steps' }, { id: 'vars', label: <span className="inline-flex items-center gap-1"><Braces size={11} /> Variables</span> }, { id: 'history', label: `Runs · ${runs.length}` }]} />}
        {!run && runs.length > 0 && <button onClick={() => setTab(tab === 'history' ? 'steps' : 'history')} className="chip hover:text-[var(--text)] !h-7"><History size={11} /> {runs.length} run{runs.length === 1 ? '' : 's'}</button>}
        {run && finished && <Button size="sm" onClick={onReset}><Play size={12} /> New run</Button>}
        {run && <button onClick={() => nav(`/runs?open=${run.id}`)} className="btn btn-ghost btn-sm" title="Open in Runs"><ExternalLink size={13} /></button>}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      {tab === 'history' ? (
        <div className="p-3 grid grid-cols-2 lg:grid-cols-3 gap-1.5 scroll">{runs.length === 0 ? <div className="py-8 text-center text-[12.5px] muted col-span-3">No runs yet.</div> : runs.slice(0, 30).map((r) => <RunRow key={r.id} r={r} onClick={() => { onPick(r.id); setTab('steps') }} />)}</div>
      ) : !run ? (
        <div className="p-4 flex gap-4 min-h-0">
          <div className="flex-1 flex flex-col gap-2"><Field label="Input" hint="Becomes {{input}}. Every step can see it."><Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Research the latest changes to UAE corporate tax" autoFocus /></Field></div>
          <div className="w-[260px] flex flex-col gap-2 pt-6">
            {!apiKey && <div className="text-[12px] text-[var(--warn)]">Models are not available right now. Agent, condition and action steps will fail.</div>}
            {problems.length > 0 && <div className="text-[12px] text-[var(--warn)]">Fix the checks first: {problems[0].text}</div>}
            <Button variant="primary" onClick={onStart} disabled={!input.trim() || starting || problems.length > 0}>{starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {starting ? 'Starting…' : 'Run now'}</Button>
            <div className="text-[11.5px] muted leading-relaxed">{dirty ? 'The workflow is saved first. ' : ''}Steps light up on the canvas as they run. Approval steps pause the run until the person decides.</div>
          </div>
        </div>
      ) : tab === 'vars' ? (
        <div className="p-3 scroll flex flex-col gap-1.5">
          {Object.entries(run.vars ?? { input: run.input ?? '' }).map(([k, v]) => <details key={k} className="flat px-3 py-2"><summary className="cursor-pointer list-none flex items-center gap-2 text-[12.5px]"><code className="text-[11.5px] accent-ink">{`{{${k}}}`}</code><span className="muted truncate flex-1">{String(v).slice(0, 120).replace(/\n/g, ' ')}</span><span className="muted text-[11px]">{String(v).length} chars</span></summary><pre className="mt-2 text-[11.5px] whitespace-pre-wrap max-h-[150px] overflow-auto muted">{String(v)}</pre></details>)}
          {run.status === 'running' && <div className="text-[11.5px] muted px-1">Updated as steps finish.</div>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[300px] shrink-0 border-r hairline scroll p-2 flex flex-col gap-1">
            <div className="flat px-2.5 py-2 text-[12px]"><span className="text-[10.5px] font-semibold uppercase tracking-wider muted">Input</span><div className="line-clamp-2 mt-0.5">{run.input}</div></div>
            {run.steps.map((s, i) => { const b = brickOf(s.brick ?? 'agent'); const I = b.icon; const on = open === i; return (
              <button key={i} onClick={() => { setOpen(i); if (s.nodeId) onSelectNode(s.nodeId) }} className={cx('w-full flex items-center gap-2 px-2 h-9 rounded-[10px] text-left hover:bg-[var(--clay-dark)]', on && 'bg-[var(--surface-2)] shadow-[0_1px_2px_rgba(16,24,40,.06)]')}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone(s) }} />
                <Tile color={b.color} size={20} radius={6}><I size={10} /></Tile>
                <span className="flex-1 min-w-0"><span className="block text-[12px] font-medium truncate">{s.name}{s.attempt ? <span className="muted font-normal"> · attempt {s.attempt}</span> : ''}</span>{s.lane && <span className="block text-[10.5px] muted truncate">{s.lane}</span>}</span>
                <span className="text-[10.5px] muted tabular-nums">{s.branch ? s.branch : s.count !== undefined ? `×${s.count}` : s.ms ? `${(s.ms / 1000).toFixed(1)}s` : ''}</span>
              </button>
            ) })}
            {cursorNode && <div className="flex items-center gap-2 px-2 h-9 text-[12px]"><Loader2 size={13} className="animate-spin accent-ink" /><span className="truncate">Working on <b>{cursorNode.data.label}</b>…</span></div>}
          </div>
          <div className="flex-1 min-w-0 scroll p-3 flex flex-col gap-2">
            {waitingStep && (
              <div className="flat p-3 border-[color-mix(in_srgb,var(--warn)_50%,var(--line))] flex items-center gap-3">
                <Hourglass size={15} className="text-[var(--warn)] shrink-0" />
                <div className="flex-1 text-[12.5px]"><b>Waiting for {approverName ?? 'an approver'}.</b> <span className="muted">The run resumes with the remaining steps once approved.</span></div>
                {canApprove && <div className="flex gap-2"><Button variant="primary" size="sm" onClick={() => onDecide(run, 'approved')}><ThumbsUp size={12} /> Approve</Button><Button size="sm" onClick={() => onDecide(run, 'rejected')}><ThumbsDown size={12} /> Reject</Button></div>}
              </div>
            )}
            {run.status === 'approved' && run.cursor && !isRunning(run.id) && <Button size="sm" className="self-start" onClick={() => resumeRun(run.id)}><Play size={12} /> Resume remaining steps</Button>}
            {sel ? (
              <div className="flex flex-col gap-2 min-h-0">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-semibold">{sel.name}</span><span className="muted">{sel.status === 'ok' ? 'Done' : sel.status === 'failed' ? (sel.continued ? 'Failed, continued' : 'Failed') : sel.status === 'waiting' ? 'Waiting' : 'Skipped'}{sel.ms ? ` · ${(sel.ms / 1000).toFixed(1)}s` : ''}{sel.model ? ` · ${sel.model}` : ''}{sel.cost ? ` · $${sel.cost.toFixed(4)}` : ''}</span>
                  {sel.key && sel.status === 'ok' && <code className="text-[11px] accent-ink">{`{{${sel.key}}}`}</code>}
                  <div className="flex-1" />
                  {finished && sel.nodeId && nodes.some((n) => n.id === sel.nodeId) && !sel.lane && <Button size="sm" onClick={() => onAgain(run, open!)} title="Start a new run that keeps the earlier results and runs again from this step"><RotateCw size={12} /> Run again from here</Button>}
                </div>
                <div className={cx('flat p-3 flex-1 min-h-0 overflow-auto', sel.status === 'failed' && !sel.continued && 'border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]')}><Md className="prose-chat text-[12px] leading-relaxed">{sel.output ?? ''}</Md></div>
              </div>
            ) : <div className="muted text-[12.5px] p-2">Pick a step to see its result.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= inspector ================= */
type Store = { agents: ReturnType<typeof useApp.getState>['agents']; councils: ReturnType<typeof useApp.getState>['councils']; users: ReturnType<typeof useApp.getState>['users']; approvers: ReturnType<typeof useApp.getState>['users']; customTools: ReturnType<typeof useApp.getState>['customTools']; profiles: ReturnType<typeof useApp.getState>['profiles']; defaultModel: string; workflows: Workflow[]; libraries: ReturnType<typeof useApp.getState>['libraries'] }

function VarChips({ vars, onInsert }: { vars: { key: string; label: string }[]; onInsert: (k: string) => void }) {
  if (!vars.length) return null
  return <div className="flex flex-wrap gap-1 mt-1.5">{vars.map((v) => <button type="button" key={v.key} onClick={() => onInsert(v.key)} title={v.label} className="h-5 px-1.5 rounded-[6px] font-mono text-[10.5px] text-[var(--accent-ink)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]">{`{{${v.key}}}`}</button>)}</div>
}
function TemplateField({ label, hint, value, onChange, vars, rows = 3, placeholder, mono }: { label: string; hint?: string; value: string; onChange: (v: string) => void; vars: { key: string; label: string }[]; rows?: number; placeholder?: string; mono?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const insert = (k: string) => { const el = ref.current; const tok = `{{${k}}}`; if (!el) { onChange(value + tok); return } const s = el.selectionStart ?? value.length; const e = el.selectionEnd ?? s; const nv = value.slice(0, s) + tok + value.slice(e); onChange(nv); setTimeout(() => { el.focus(); el.setSelectionRange(s + tok.length, s + tok.length) }, 0) }
  return (
    <Field label={label} hint={hint}>
      <textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx('input', mono && 'font-mono !text-[12px]')} />
      <VarChips vars={vars} onInsert={insert} />
    </Field>
  )
}

function StepInspector({ node, editable, onClose, onRemove, patch, meta, setMeta, edges, nodes, onAdd, onSelect, store, stored, wfForTry, sampleVars, nested, onSaveFirst }: { node: FlowNode; editable: boolean; onClose: () => void; onRemove: () => void; patch: (p: Partial<StepData>) => void; meta: Meta; setMeta: (m: Meta) => void; edges: BranchEdge[]; nodes: FlowNode[]; onAdd: (branch?: string) => void; onSelect: (id: string) => void; store: Store; stored?: Workflow; wfForTry: () => Workflow; sampleVars: Record<string, string>; nested?: 'loop' | 'parallel'; onSaveFirst: () => void }) {
  const nav = useNavigate()
  const d = node.data; const b = brickOf(d.brick); const I = b.icon
  const { agents, councils, approvers, customTools, profiles, defaultModel, workflows, libraries } = store
  const agent = d.agentId ? agents.find((a) => a.id === d.agentId) : undefined
  const thinkingId = thinkingOf({ model: d.model ?? defaultModel }, profiles, defaultModel)?.id ?? 'balanced'
  const outs = edges.filter((e) => e.source === node.id)
  const branchTarget = (br: string) => { const e = outs.find((x) => x.data?.label === br); return e ? nodes.find((n) => n.id === e.target) : undefined }
  const next = outs.map((e) => nodes.find((n) => n.id === e.target)).filter(Boolean) as FlowNode[]
  const vars = useMemo(() => { const plainNodes = nodes.map((n) => { const { ui: _u, ...data } = n.data; return { id: n.id, type: 'step' as const, position: n.position, data } }); return varsBefore(plainNodes, edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label })), node.id) }, [nodes, edges, node.id])
  const [advanced, setAdvanced] = useState(false)
  const [tryState, setTry] = useState<{ open: boolean; input: string; busy: boolean; result?: RunStep }>({ open: false, input: sampleVars.input ?? '', busy: false })
  const [checking, setChecking] = useState<string>('')
  const canTry = ['agent', 'tool', 'code', 'http', 'logic', 'flow', 'notify', 'set', 'extract', 'classify'].includes(d.brick)
  const runTry = async () => {
    setTry((t) => ({ ...t, busy: true, result: undefined }))
    try { const r = await tryStep(wfForTry(), node.id, { ...sampleVars, input: tryState.input }); setTry((t) => ({ ...t, busy: false, result: r })) }
    catch (e: any) { setTry((t) => ({ ...t, busy: false, result: { name: d.label, ms: 0, status: 'failed', output: `Error: ${e?.message ?? e}` } })) }
  }
  const linkUrl = `${location.origin}/run/${stored?.id ?? node.id}`
  const triggerItems: { id: TriggerType; label: string; icon: typeof Zap }[] = [{ id: 'manual', label: 'By hand', icon: Zap }, { id: 'schedule', label: 'Schedule', icon: Clock }, { id: 'link', label: 'By link', icon: Link2 }, { id: 'watch', label: 'Page changes', icon: Eye }, { id: 'event', label: 'Document added', icon: FileInput }]
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 h-12 flex items-center gap-2 border-b hairline shrink-0">
        <Tile color={b.color} size={26} radius={8}><I size={13} /></Tile>
        <span className="text-[13px] font-semibold flex-1 truncate">{b.label}</span>
        {nested && <Chip>{nested === 'loop' ? 'In a Repeat' : 'In a Split'}</Chip>}
        {editable && d.brick !== 'trigger' && <button className="btn btn-ghost btn-sm btn-icon" onClick={onRemove} title="Delete step" aria-label="Delete step"><Trash2 size={14} /></button>}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Close" aria-label="Close"><X size={14} /></button>
      </div>
      <fieldset disabled={!editable} className="p-4 flex flex-col gap-4 scroll">
        {d.brick !== 'trigger' && <Field label="Step name"><Input value={d.label} onChange={(e) => patch({ label: e.target.value })} placeholder={b.label} /></Field>}

        {d.brick === 'trigger' && (
          <>
            <Field label="How it starts">
              <div className="grid grid-cols-2 gap-1.5">{triggerItems.map((t) => { const on = meta.triggerType === t.id; return <button type="button" key={t.id} onClick={() => setMeta({ ...meta, triggerType: t.id })} className={cx('flat px-2.5 h-9 flex items-center gap-2 text-[12px] font-semibold text-left', on && 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]')}><t.icon size={13} className={on ? 'accent-ink' : 'muted'} /> {t.label}</button> })}</div>
            </Field>
            {meta.triggerType === 'manual' && <div className="text-[12px] muted -mt-2 leading-relaxed">Each run starts with an input you type. It becomes <code className="text-[11px]">{'{{input}}'}</code>, which every step can see.</div>}
            {meta.triggerType === 'schedule' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Every"><Select value={meta.schedule.every} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, every: e.target.value as Schedule['every'] } })}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week (Mondays)</option></Select></Field>
                  <Field label="At"><Input type="time" value={meta.schedule.at} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, at: e.target.value } })} /></Field>
                </div>
                <Field label="Input for each run"><Textarea rows={3} value={meta.schedule.input} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, input: e.target.value } })} placeholder="e.g. Check for news about our top 3 competitors" /></Field>
                <div className="text-[12px] muted leading-relaxed">Fires while Co-Create is open and the workflow is published. Last run: {stored?.lastRunAt ? new Date(stored.lastRunAt).toLocaleString() : 'never'}.</div>
              </>
            )}
            {meta.triggerType === 'link' && (
              <>
                <Field label="Run link" hint="Opening this link in a browser that is signed in starts a run. Add ?input=… to pass the input. Share it with other tools and bookmarks.">
                  {stored ? <div className="flat p-2 pl-3 flex items-center gap-2"><code className="text-[11.5px] flex-1 truncate">{linkUrl}</code><Button size="sm" onClick={() => navigator.clipboard?.writeText(linkUrl)}><Copy size={12} /> Copy</Button></div> : <div className="flat p-3 text-[12px] flex items-center gap-2"><span className="flex-1 muted">Save the workflow to get its link.</span><Button size="sm" onClick={onSaveFirst}>Save</Button></div>}
                </Field>
                <div className="text-[12px] muted leading-relaxed">The workflow must be published for the link to work. Each open starts one run.</div>
              </>
            )}
            {meta.triggerType === 'watch' && (
              <>
                <Field label="Page to watch" hint="The page text is read and compared with the last check. When it changed, a run starts with the new text."><Input value={meta.watch.url} onChange={(e) => setMeta({ ...meta, watch: { ...meta.watch, url: e.target.value } })} placeholder="https://example.com/pricing" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Check every"><Select value={String(meta.watch.every)} onChange={(e) => setMeta({ ...meta, watch: { ...meta.watch, every: Number(e.target.value) } })}>{[[15, '15 minutes'], [30, '30 minutes'], [60, 'Hour'], [180, '3 hours'], [360, '6 hours'], [1440, 'Day']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                  <Field label="Last checked"><div className="text-[12px] muted h-[38px] flex items-center">{stored?.watch?.lastCheckedAt ? new Date(stored.watch.lastCheckedAt).toLocaleTimeString() : 'never'}</div></Field>
                </div>
                <Field label="What to do with the change"><Textarea rows={2} value={meta.watch.input} onChange={(e) => setMeta({ ...meta, watch: { ...meta.watch, input: e.target.value } })} placeholder="e.g. Tell me which prices moved and by how much" /></Field>
                <div className="flex items-center gap-2"><Button size="sm" disabled={!stored || !/^https?:\/\//.test(meta.watch.url) || checking === 'busy'} onClick={async () => { setChecking('busy'); const r = await checkWatch(stored!); setChecking(r === 'first' ? 'Baseline saved. The next change starts a run.' : r === 'same' ? 'No change since the last check.' : r === 'changed' ? 'Changed. A run was started.' : 'The page could not be read.') }}>{checking === 'busy' ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Check now</Button><span className="text-[11.5px] muted">{checking !== 'busy' ? checking || (!stored ? 'Save first.' : '') : ''}</span></div>
              </>
            )}
            {meta.triggerType === 'event' && (
              <>
                <Field label="When a document is added to" hint="Starts a run with the document's title and text as the input."><Select value={meta.event.libraryId ?? ''} onChange={(e) => setMeta({ ...meta, event: { kind: 'document_added', libraryId: e.target.value || undefined } })}><option value="">Any library except Agent outputs</option>{libraries.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
                <div className="text-[12px] muted leading-relaxed">Fires while Co-Create is open and the workflow is published. Documents saved by agents into Agent outputs do not trigger it unless that library is chosen.</div>
              </>
            )}
          </>
        )}

        {d.brick === 'agent' && (
          <>
            <Field label="Who does this step">
              <Select value={d.agentId ?? ''} onChange={(e) => { const a = agents.find((x) => x.id === e.target.value); patch({ agentId: e.target.value || undefined, label: a ? a.name : d.label, model: a?.model ?? d.model }) }}>
                <option value="">A one-off agent (set up below)</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status === 'draft' ? ' · draft' : ''}</option>)}
              </Select>
            </Field>
            {agent ? (
              <div className="flat p-3 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5"><AgentAvatar name={agent.name} icon={agent.icon} color={agent.color} size={32} radius={10} /><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{agent.name}</div><div className="text-[11px] muted truncate">{agent.status === 'live' ? 'Live' : 'Draft'} · {INDEPENDENCE.find((i) => i.level === agent.autonomy)?.label}</div></div><button type="button" onClick={() => nav(`/agents/${agent.id}`)} className="text-[11.5px] accent-ink font-medium hover:underline inline-flex items-center gap-1">Open <ExternalLink size={11} /></button></div>
                <div className="flex items-center gap-3"><AbilityWells tools={agent.tools} custom={customTools} max={6} size={22} /><ThinkingMeter model={agent.model} profiles={profiles} defaultModel={defaultModel} /></div>
              </div>
            ) : (
              <Field label="Thinking" hint="Read-only abilities: web search, read pages, calculator, scripts, knowledge, save document.">
                <Segmented value={thinkingId} onChange={(id) => patch({ model: profiles.find((p) => p.id === id)?.model ?? defaultModel })} items={THINKING.map((t) => ({ id: t.id, label: <span className="inline-flex items-center gap-1.5"><t.icon size={12} /> {t.label}</span> }))} />
              </Field>
            )}
            <TemplateField label={agent ? 'Extra instructions for this step' : 'What this step should do'} value={d.prompt ?? ''} onChange={(v) => patch({ prompt: v })} vars={vars} rows={4} placeholder={agent ? 'e.g. Focus on the last 30 days and keep it under 200 words' : 'e.g. Summarise the findings into a one-page brief with sources'} />
            <TemplateField label="What it receives" hint="Leave empty to pass everything earlier steps produced. Or compose exactly what this step sees." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={3} placeholder={'Everything so far, or e.g.\nTopic: {{input}}\n\n{{research}}'} />
          </>
        )}

        {d.brick === 'logic' && (
          <>
            <Field label="How to check"><Segmented value={d.mode ?? 'ai'} onChange={(m) => patch({ mode: m })} items={[{ id: 'ai', label: 'Plain language' }, { id: 'rule', label: 'Rule' }]} /></Field>
            {d.mode === 'rule' ? (
              <>
                <TemplateField label="Check this value" value={d.rule?.left ?? ''} onChange={(v) => patch({ rule: { left: v, op: d.rule?.op ?? 'contains', right: d.rule?.right ?? '' } })} vars={vars} rows={1} placeholder="{{research}}" mono />
                <div className="grid grid-cols-[1fr_1fr] gap-3">
                  <Field label="Is"><Select value={d.rule?.op ?? 'contains'} onChange={(e) => patch({ rule: { left: d.rule?.left ?? '', op: e.target.value as RuleOp, right: d.rule?.right ?? '' } })}>{(Object.keys(ruleLabel) as RuleOp[]).map((op) => <option key={op} value={op}>{ruleLabel[op]}</option>)}</Select></Field>
                  {d.rule?.op !== 'empty' && d.rule?.op !== 'not_empty' && <Field label={d.rule?.op === 'gt' || d.rule?.op === 'lt' ? 'Number' : d.rule?.op === 'matches' ? 'Pattern' : 'Text'}><Input value={d.rule?.right ?? ''} onChange={(e) => patch({ rule: { left: d.rule?.left ?? '', op: d.rule?.op ?? 'contains', right: e.target.value } })} placeholder={d.rule?.op === 'gt' || d.rule?.op === 'lt' ? '100' : 'NOTHING NEW'} /></Field>}
                </div>
                <div className="text-[12px] muted -mt-2 leading-relaxed">Checked without a model, so it is instant and free. Text comparisons ignore case.</div>
              </>
            ) : (
              <TemplateField label="Check that…" hint="Judged by a model against the latest result. Yes continues on the green branch, No on the red one." value={d.sub ?? ''} onChange={(v) => patch({ sub: v })} vars={vars} rows={3} placeholder="e.g. the report mentions a price change" />
            )}
            <Branches pairs={[['yes', 'Yes', 'var(--ok)'], ['no', 'No', 'var(--danger)']]} branchTarget={branchTarget} editable={editable} onSelect={onSelect} onAdd={onAdd} emptyNo="Ends the run" />
          </>
        )}

        {d.brick === 'loop' && (
          <>
            <TemplateField label="Items to repeat over" hint="A variable holding a list: a JSON array or one item per line. Leave empty to extract a list from the latest result." value={d.items ?? ''} onChange={(v) => patch({ items: v })} vars={vars} rows={2} placeholder="{{input}}" mono />
            <Field label="At most"><Input type="number" min={1} max={25} value={d.maxItems ?? 10} onChange={(e) => patch({ maxItems: Math.min(25, Math.max(1, +e.target.value || 1)) })} className="!w-[90px]" /></Field>
            <div className="text-[12px] muted -mt-2 leading-relaxed">Steps on <b>Each</b> run once per item and can use <code className="text-[11px]">{'{{item}}'}</code> and <code className="text-[11px]">{'{{index}}'}</code>. When all items are done, the results are stored as <code className="text-[11px]">{`{{${keyOf(d)}}}`}</code> and the <b>Done</b> branch runs.</div>
            <Branches pairs={[['each', 'Each', 'var(--ok)'], ['done', 'Done', 'var(--muted)']]} branchTarget={branchTarget} editable={editable} onSelect={onSelect} onAdd={onAdd} emptyNo="Ends the run" />
          </>
        )}

        {d.brick === 'parallel' && (
          <>
            <div className="text-[12px] muted leading-relaxed">Every step connected after this one runs at the same time. They join again at the first step they all lead to; its input can use each branch's variable.</div>
            <div className="flex flex-col gap-1.5">
              {next.map((n) => <button type="button" key={n.id} onClick={() => onSelect(n.id)} className="flat p-2.5 flex items-center gap-2 text-[12.5px] text-left hover:underline"><Tile color={brickOf(n.data.brick).color} size={20} radius={6}>{(() => { const J = brickOf(n.data.brick).icon; return <J size={10} /> })()}</Tile><span className="truncate flex-1">{n.data.label}</span>{producesVar(n.data.brick) && <code className="text-[10.5px] accent-ink">{`{{${keyOf(n.data)}}}`}</code>}</button>)}
              {editable && <button type="button" onClick={() => onAdd()} className="text-[12px] accent-ink font-medium text-left hover:underline inline-flex items-center gap-1"><Plus size={12} /> Add a branch</button>}
            </div>
          </>
        )}

        {d.brick === 'human' && (
          <>
            <Field label="Who approves" hint="The run pauses here. They get a notification and decide under Runs or right in the run drawer.">
              <Select value={d.approver ?? ''} onChange={(e) => patch({ approver: e.target.value || undefined })}><option value="">Choose a person</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select>
            </Field>
            <TemplateField label="Note for the approver (optional)" value={d.sub ?? ''} onChange={(v) => patch({ sub: v })} vars={vars} rows={2} placeholder="e.g. Check the numbers in {{draft}} before it is saved" />
          </>
        )}

        {d.brick === 'tool' && (
          <>
            <Field label="Ability to call" hint="Arguments are filled in by the Fast model from what the step receives; the ability is called once.">
              <Select value={d.tool ?? 'save_document'} onChange={(e) => patch({ tool: e.target.value })}>
                {(['Knowledge', 'Web', 'Actions'] as const).map((cat) => <optgroup key={cat} label={cat}>{TOOLS.filter((t) => t.category === cat).map((t) => <option key={t.name} value={t.name}>{t.label}{t.write ? ' · asks a person' : ''}</option>)}</optgroup>)}
                {customTools.length > 0 && <optgroup label="Your APIs and connectors">{customTools.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}</optgroup>}
              </Select>
            </Field>
            <TemplateField label="Guidance (optional)" value={d.prompt ?? ''} onChange={(v) => patch({ prompt: v })} vars={vars} rows={2} placeholder="e.g. Title the document with today's date" />
            <TemplateField label="What it receives" hint="Leave empty to pass everything so far." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={2} placeholder="e.g. Save this: {{draft}}" />
          </>
        )}

        {d.brick === 'code' && (
          <>
            <Field label="JavaScript" hint="vars.<name> holds every variable so far; return a value to store it. No network, 5 second limit.">
              <textarea rows={8} value={d.code ?? ''} onChange={(e) => patch({ code: e.target.value })} spellCheck={false} className="input font-mono !text-[12px] !leading-relaxed" />
              <VarChips vars={vars} onInsert={(k) => patch({ code: (d.code ?? '') + `vars.${k}` })} />
            </Field>
            <div className="text-[12px] muted -mt-2 leading-relaxed">Example: <code className="text-[11px]">return JSON.parse(vars.rates).rates.EUR</code></div>
          </>
        )}

        {d.brick === 'http' && (
          <>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <Field label="Method"><Select value={d.method ?? 'GET'} onChange={(e) => patch({ method: e.target.value as StepData['method'] })}>{['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}</Select></Field>
              <TemplateField label="Address" value={d.url ?? ''} onChange={(v) => patch({ url: v })} vars={vars} rows={1} placeholder="https://api.frankfurter.dev/v1/latest?base=USD&symbols={{input}}" mono />
            </div>
            <TemplateField label="Headers (JSON, optional)" value={d.headers ?? ''} onChange={(v) => patch({ headers: v })} vars={vars} rows={2} placeholder='{"Authorization": "Bearer …"}' mono />
            {d.method !== 'GET' && <TemplateField label="Body" value={d.body ?? ''} onChange={(v) => patch({ body: v })} vars={vars} rows={3} placeholder='{"text": "{{draft}}"}' mono />}
            <div className="text-[12px] muted -mt-2 leading-relaxed">The response body is stored as <code className="text-[11px]">{`{{${keyOf(d)}}}`}</code>; JSON fields can be read as <code className="text-[11px]">{`{{${keyOf(d)}.field}}`}</code>. The API must allow browser requests.</div>
          </>
        )}

        {d.brick === 'flow' && (
          <>
            <Field label="Workflow to run" hint="Runs as its own run under Runs and its last result becomes this step's result. It cannot contain an approval."><Select value={d.workflowId ?? ''} onChange={(e) => { const w = workflows.find((x) => x.id === e.target.value); patch({ workflowId: e.target.value || undefined, label: w && (d.label === 'Run a workflow' || !d.label) ? w.name : d.label }) }}><option value="">Choose a workflow</option>{workflows.map((w) => <option key={w.id} value={w.id}>{w.name} · {w.status}</option>)}</Select></Field>
            <TemplateField label="Its input" hint="Leave empty to pass the latest result." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={2} placeholder="{{input}}" />
          </>
        )}

        {d.brick === 'wait' && <Field label="Wait for" hint="Up to 10 minutes. The run stays open while it waits."><div className="flex items-center gap-2"><Input type="number" min={1} max={600} value={d.wait ?? 30} onChange={(e) => patch({ wait: Math.min(600, Math.max(1, +e.target.value || 1)) })} className="!w-[110px]" /><span className="text-[12.5px] muted">seconds</span></div></Field>}

        {d.brick === 'set' && (
          <Field label="Variables" hint="Each value is a template. Later steps use {{name}}.">
            <div className="flex flex-col gap-2">
              {(d.assign ?? []).map((a, i) => <div key={i} className="flex items-start gap-2"><Input value={a.key} onChange={(e) => patch({ assign: (d.assign ?? []).map((x, j) => (j === i ? { ...x, key: e.target.value } : x)) })} placeholder="name" className="!w-[120px] font-mono !text-[12px]" /><textarea rows={1} value={a.value} onChange={(e) => patch({ assign: (d.assign ?? []).map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} placeholder="{{input}}" className="input font-mono !text-[12px] flex-1" /><button type="button" onClick={() => patch({ assign: (d.assign ?? []).filter((_, j) => j !== i) })} className="btn btn-ghost btn-sm btn-icon shrink-0" aria-label="Remove variable"><Minus size={13} /></button></div>)}
              <button type="button" onClick={() => patch({ assign: [...(d.assign ?? []), { key: '', value: '' }] })} className="text-[12px] accent-ink font-medium text-left hover:underline inline-flex items-center gap-1"><Plus size={12} /> Add a variable</button>
              <VarChips vars={vars} onInsert={(k) => { const a = d.assign ?? []; if (!a.length) return; patch({ assign: a.map((x, j) => (j === a.length - 1 ? { ...x, value: x.value + `{{${k}}}` } : x)) }) }} />
            </div>
          </Field>
        )}

        {d.brick === 'extract' && (
          <>
            <Field label="Fields to extract" hint="The Fast model fills them from what the step receives and stores JSON you can read as {{key.field}}.">
              <div className="flex flex-col gap-2">
                {(d.fields ?? []).map((f, i) => <div key={i} className="flex items-start gap-2"><Input value={f.name} onChange={(e) => patch({ fields: (d.fields ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="field" className="!w-[120px] font-mono !text-[12px]" /><Input value={f.description} onChange={(e) => patch({ fields: (d.fields ?? []).map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} placeholder="what it holds" className="flex-1" /><button type="button" onClick={() => patch({ fields: (d.fields ?? []).filter((_, j) => j !== i) })} className="btn btn-ghost btn-sm btn-icon shrink-0" aria-label="Remove field"><Minus size={13} /></button></div>)}
                <button type="button" onClick={() => patch({ fields: [...(d.fields ?? []), { name: '', description: '' }] })} className="text-[12px] accent-ink font-medium text-left hover:underline inline-flex items-center gap-1"><Plus size={12} /> Add a field</button>
              </div>
            </Field>
            <TemplateField label="What it reads" hint="Leave empty to read everything so far." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={2} placeholder="{{research}}" />
          </>
        )}

        {d.brick === 'classify' && (
          <>
            <Field label="Categories" hint="One per line. A model picks exactly one and the run continues on that branch; the pick is stored as the step's variable."><Textarea rows={4} value={(d.categories ?? []).join('\n')} onChange={(e) => patch({ categories: e.target.value.split('\n').map((c) => c.replace(/\s+/g, ' ').trim()).filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 8) })} placeholder={'Question\nRequest\nComplaint\nOther'} /></Field>
            <TemplateField label="What it reads" hint="Leave empty to read the latest result." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={2} placeholder="{{input}}" />
            <Branches pairs={branchesOf(d).map((b) => [b.id, b.label, branchTone(b.id)] as [string, string, string])} branchTarget={branchTarget} editable={editable} onSelect={onSelect} onAdd={onAdd} emptyNo="Ends the run" />
          </>
        )}

        {d.brick === 'notify' && <TemplateField label="Message" hint="Leave empty to send the latest result. Everyone in the workspace sees it under Notifications." value={d.input ?? ''} onChange={(v) => patch({ input: v })} vars={vars} rows={2} placeholder="e.g. Prices moved: {{check}}" />}

        {d.brick === 'council' && (
          <>
            <div className="flat p-3 text-[12px] leading-relaxed"><span className="chip chip-accent !h-5 !text-[10.5px] mr-1.5">Coming soon</span>Councils, where several agents deliberate on one case, are being finished. Existing council steps still run.</div>
            {councils.length > 0 && <Field label="Council"><Select value={d.councilId ?? ''} onChange={(e) => patch({ councilId: e.target.value || undefined })}><option value="">Choose a council</option>{councils.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          </>
        )}

        {producesVar(d.brick) && (
          <Field label="Stored as" hint="Later steps use this name inside double braces."><div className="flex items-center gap-2"><span className="muted text-[13px]">{'{{'}</span><Input value={d.key ?? ''} onChange={(e) => patch({ key: e.target.value })} placeholder={keyOf({ ...d, key: undefined })} className="font-mono !text-[12px]" /><span className="muted text-[13px]">{'}}'}</span></div></Field>
        )}

        {['agent', 'council', 'tool', 'code', 'http', 'flow', 'logic', 'loop', 'parallel', 'extract', 'classify'].includes(d.brick) && (
          <div>
            <button type="button" onClick={() => setAdvanced(!advanced)} className="text-[12px] font-semibold inline-flex items-center gap-1 muted hover:text-[var(--text)]">{advanced ? <ChevronDown size={13} /> : <ChevronRight size={13} />} If it fails</button>
            {advanced && (
              <div className="mt-2 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Try again"><Select value={String(d.retries ?? 0)} onChange={(e) => patch({ retries: +e.target.value })}>{[0, 1, 2, 3, 5].map((n) => <option key={n} value={n}>{n === 0 ? 'Never' : `${n} time${n === 1 ? '' : 's'}`}</option>)}</Select></Field>
                  {(d.brick === 'agent' || d.brick === 'http' || d.brick === 'council') && <Field label="Give up after"><Select value={String(d.timeout ?? 120)} onChange={(e) => patch({ timeout: +e.target.value })}>{[30, 60, 120, 300, 600].map((n) => <option key={n} value={n}>{n < 60 ? `${n}s` : `${n / 60} min`}</option>)}</Select></Field>}
                </div>
                <Field label="Then"><Segmented value={d.onError ?? 'stop'} onChange={(v) => patch({ onError: v })} items={[{ id: 'stop', label: 'Stop the run' }, { id: 'continue', label: 'Continue anyway' }]} /></Field>
              </div>
            )}
          </div>
        )}

        {canTry && (
          <div className="pt-3 border-t hairline">
            <button type="button" onClick={() => setTry((t) => ({ ...t, open: !t.open }))} className="text-[12px] font-semibold inline-flex items-center gap-1.5 hover:text-[var(--accent-ink)]"><FlaskConical size={13} /> Try this step{tryState.open ? <ChevronDown size={13} className="muted" /> : <ChevronRight size={13} className="muted" />}</button>
            {tryState.open && (
              <div className="mt-2 flex flex-col gap-2">
                <div className="text-[11.5px] muted leading-snug">Runs only this step with {Object.keys(sampleVars).length > 1 ? `the variables of the last run (${Object.keys(sampleVars).filter((k) => k !== 'input').map((k) => `{{${k}}}`).join(', ')})` : 'the input below'}. Nothing is recorded.</div>
                <Textarea rows={2} value={tryState.input} onChange={(e) => setTry((t) => ({ ...t, input: e.target.value }))} placeholder="Sample input" />
                <Button size="sm" onClick={runTry} disabled={tryState.busy}>{tryState.busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Run step</Button>
                {tryState.result && <div className={cx('flat p-3', tryState.result.status === 'failed' && 'border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]')}><div className="text-[11px] muted mb-1">{tryState.result.status === 'ok' ? 'Done' : tryState.result.status === 'failed' ? 'Failed' : 'Skipped'}{tryState.result.ms ? ` · ${(tryState.result.ms / 1000).toFixed(1)}s` : ''}{tryState.result.cost ? ` · $${tryState.result.cost.toFixed(4)}` : ''}</div><Md className="prose-chat text-[12px] max-h-[220px] overflow-auto">{tryState.result.output ?? ''}</Md></div>}
              </div>
            )}
          </div>
        )}

        {!['logic', 'loop', 'parallel', 'classify'].includes(d.brick) && next.length > 0 && (
          <div className="pt-2 border-t hairline">
            <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1.5">Then</div>
            {next.map((n) => <button key={n.id} type="button" onClick={() => onSelect(n.id)} className="w-full flex items-center gap-2 text-[12.5px] py-1 hover:underline text-left"><Tile color={brickOf(n.data.brick).color} size={20} radius={6}>{(() => { const J = brickOf(n.data.brick).icon; return <J size={10} /> })()}</Tile><span className="truncate">{n.data.label}</span><ChevronRight size={12} className="muted ml-auto" /></button>)}
          </div>
        )}
        {!['logic', 'loop', 'parallel', 'classify'].includes(d.brick) && editable && <button type="button" onClick={() => onAdd()} className="text-[12px] accent-ink font-medium text-left hover:underline inline-flex items-center gap-1"><Plus size={12} /> Add a step after this one</button>}
      </fieldset>
    </div>
  )
}

function Branches({ pairs, branchTarget, editable, onSelect, onAdd, emptyNo }: { pairs: [string, string, string][]; branchTarget: (br: string) => FlowNode | undefined; editable: boolean; onSelect: (id: string) => void; onAdd: (b: string) => void; emptyNo: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map(([br, label, color], i) => { const t = branchTarget(br); return (
        <div key={br} className="flat p-2.5 flex items-center gap-2 text-[12.5px]">
          <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold text-white" style={{ background: color }}>{label}</span>
          {t ? <button type="button" onClick={() => onSelect(t.id)} className="flex-1 text-left truncate font-medium hover:underline">→ {t.data.label}</button> : <span className="flex-1 muted">{i === 0 ? 'Nothing yet' : emptyNo}</span>}
          {editable && !t && <button type="button" onClick={() => onAdd(br)} className="text-[11.5px] accent-ink font-medium hover:underline">Add step</button>}
        </div>
      ) })}
    </div>
  )
}

