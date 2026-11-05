import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, type Connection, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Play, Check, Pause, X, Trash2, MoreHorizontal, Download, Copy, Wand2, LayoutGrid, AlertTriangle, CheckCircle2, Clock, Zap, Sparkles, ArrowUp, ExternalLink, ChevronDown, ChevronRight, Loader2, Hourglass, ThumbsUp, ThumbsDown, History, SlidersHorizontal, ListChecks } from 'lucide-react'
import { useApp, useUser, can, profileModels } from '@/store/app'
import { workflowTemplates, roleLabel, type Brick, type StepData, type Workflow, type Schedule, type Run, type WfNode, type WfEdge } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { startRun, resumeRun, isRunning } from '@/lib/runner'
import { BRICKS, brickOf, uid, autoLayout, checkFlow, newStep, stepLine, NODE_W, type Problem } from '@/lib/flow'
import { THINKING, INDEPENDENCE, thinkingOf } from '@/lib/agentVocab'
import { nodeTypes, edgeTypes, type FlowNode, type BranchEdge, type StepStatus, type FlowUi } from '@/components/FlowNodes'
import { Button, Chip, Confirm, Field, Input, Select, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { AgentAvatar } from '@/components/AgentAvatar'
import { AbilityWells, ThinkingMeter } from '@/components/AgentBits'
import { Md } from '@/components/Md'

const DT = 'application/x-cocreate-brick'
const blankUi: FlowUi = { line: '', editable: false }
const toFlowNodes = (ns: WfNode[]): FlowNode[] => ns.map((n) => ({ id: n.id, type: 'step', position: n.position, data: { ...n.data, ui: blankUi } }))
const toFlowEdges = (es: WfEdge[], ns: WfNode[]): BranchEdge[] => es.map((e) => { const logic = ns.find((n) => n.id === e.source)?.data.brick === 'logic'; const label = e.label?.toLowerCase().startsWith('no') ? 'no' : e.label?.toLowerCase().startsWith('yes') ? 'yes' : logic ? 'yes' : undefined; return { id: e.id, source: e.source, target: e.target, type: 'branch', sourceHandle: logic ? label : undefined, data: { label } } })

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
type Adding = { after: string; branch?: 'yes' | 'no' } | null

function Editor({ base, stored, isNew, buildText }: { base: Workflow; stored?: Workflow; isNew: boolean; buildText: string }) {
  const nav = useNavigate()
  const user = useUser()!
  const store = useApp()
  const { agents, councils, upsertWorkflow, deleteWorkflow, runs, apiKey, defaultModel, users, customTools, profiles, decideRun } = store
  const rf = useReactFlow<FlowNode, BranchEdge>()
  const editable = can(user, 'build')
  const approvers = users.filter((u) => can(u, 'approve'))

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(toFlowNodes(base.nodes))
  const [edges, setEdges, onEdgesChange] = useEdgesState<BranchEdge>(toFlowEdges(base.edges, base.nodes))
  const [meta, setMeta] = useState({ name: base.name, description: base.description, triggerType: base.triggerType, schedule: base.schedule ?? ({ every: 'day', at: '08:00', input: '' } as Schedule), autonomy: base.autonomy, status: base.status, version: base.version })
  const [sel, setSel] = useState<Sel>(null)
  const [adding, setAdding] = useState<Adding>(null)
  const [dock, setDock] = useState<'inspect' | 'run'>('inspect')
  const [flowTab, setFlowTab] = useState<'setup' | 'checks' | 'history'>('setup')
  const [runInput, setRunInput] = useState(base.schedule?.input || '')
  const [testRunId, setTestRunId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [assist, setAssist] = useState({ input: buildText, busy: false, note: '' })
  const [menu, setMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const builtRef = useRef(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => { const el = canvasRef.current; if (el) setSize({ w: el.clientWidth, h: el.clientHeight }) }, [])

  // ---------- derived ----------
  const plain = useCallback((): { nodes: WfNode[]; edges: WfEdge[] } => ({ nodes: nodes.map((n) => { const { ui: _ui, ...data } = n.data; return { id: n.id, type: 'step', position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data } }), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label })) }), [nodes, edges])
  const current = useCallback((): Workflow => ({ ...base, ...meta, schedule: meta.triggerType === 'schedule' ? meta.schedule : undefined, ...plain(), updatedAt: new Date().toISOString().slice(0, 10) }), [base, meta, plain])
  const strip = (w: Workflow) => JSON.stringify({ ...w, updatedAt: '', version: 0, lastRunAt: 0, status: '' })
  const dirty = strip(current()) !== strip(stored ?? base) || (isNew && !stored)
  const problems = useMemo<Problem[]>(() => { const p = plain(); return checkFlow(p.nodes, p.edges, { hasAgent: (id) => !!id && agents.some((a) => a.id === id), hasCouncil: (id) => !!id && councils.some((c) => c.id === id), hasUser: (id) => !!id && users.some((u) => u.id === id) }) }, [plain, agents, councils, users])
  const wfRuns = useMemo(() => runs.filter((r) => r.workflowId === base.id), [runs, base.id])
  const liveRun = useMemo(() => (testRunId ? runs.find((r) => r.id === testRunId) : wfRuns.find((r) => r.status === 'running' || r.status === 'waiting')) ?? null, [runs, testRunId, wfRuns])
  const statusOf = useMemo(() => {
    const m = new Map<string, StepStatus>()
    if (!liveRun) return m
    for (const s of liveRun.steps) { const id = s.nodeId ?? nodes.find((n) => n.data.label === s.name)?.id; if (id) m.set(id, s.status === 'ok' ? 'ok' : s.status === 'failed' ? 'failed' : s.status === 'waiting' ? 'waiting' : 'skipped') }
    if (liveRun.status === 'running' && liveRun.cursor) m.set(liveRun.cursor, 'running')
    if (liveRun.status === 'waiting') { const w = liveRun.steps.find((s) => s.status === 'waiting'); const id = w?.nodeId ?? nodes.find((n) => n.data.label === w?.name)?.id; if (id) m.set(id, 'waiting') }
    return m
  }, [liveRun, nodes])
  const selectedNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined
  const selectedEdge = sel?.kind === 'edge' ? edges.find((e) => e.id === sel.id) : undefined
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? ''

  const lineFor = useCallback((d: StepData) => {
    if (d.brick === 'trigger') return meta.triggerType === 'schedule' ? `Every ${meta.schedule.every} at ${meta.schedule.at}` : d.sub || 'Run with an input'
    if (d.brick !== 'logic' && d.sub?.trim()) return d.sub
    return stepLine(d, { agentName: (id) => agents.find((a) => a.id === id)?.name, userName: (id) => users.find((u) => u.id === id)?.name, toolLabel: (id) => TOOLS.find((t) => t.name === id)?.label ?? customTools.find((t) => t.name === id)?.label, councilName: (id) => councils.find((c) => c.id === id)?.name })
  }, [meta, agents, users, customTools, councils])

  // ---------- graph ops ----------
  const select = (s: Sel) => { setSel(s); setAdding(null); if (s) setDock('inspect') }
  const addStep = useCallback((brick: Brick, opts: { after?: string; branch?: 'yes' | 'no'; position?: { x: number; y: number }; extra?: Partial<StepData> } = {}) => {
    if (brick === 'trigger' && nodes.some((n) => n.data.brick === 'trigger')) return
    const after = opts.after ? nodes.find((n) => n.id === opts.after) : undefined
    const id = uid()
    const position = opts.position ?? (after ? { x: after.position.x + NODE_W + 92, y: after.position.y + (opts.branch === 'no' ? 140 : opts.branch === 'yes' ? -40 : 0) } : { x: 60 + nodes.length * 40, y: 160 + nodes.length * 30 })
    const data: StepData = { ...newStep(brick, { model: defaultModel, approver: approvers[0]?.id }, opts.extra), ...(opts.extra?.agentId ? { label: agents.find((a) => a.id === opts.extra!.agentId)?.name ?? brickOf(brick).label } : {}) }
    setNodes((ns) => [...ns, { id, type: 'step', position, data: { ...data, ui: blankUi } }])
    if (after) { const branch = after.data.brick === 'logic' ? opts.branch ?? 'yes' : undefined; setEdges((es) => [...es, { id: `e${uid()}`, source: after.id, target: id, type: 'branch', sourceHandle: branch, data: { label: branch } }]) }
    setSel({ kind: 'node', id }); setAdding(null); setDock('inspect')
    setTimeout(() => ensureVisible(position), 20)
    return id
  }, [nodes, defaultModel, approvers, agents, setNodes, setEdges]) // eslint-disable-line react-hooks/exhaustive-deps
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return
    const src = nodes.find((n) => n.id === c.source); const tgt = nodes.find((n) => n.id === c.target)
    if (!src || !tgt || tgt.data.brick === 'trigger') return
    const branch = src.data.brick === 'logic' ? ((c.sourceHandle as 'yes' | 'no' | null) ?? 'yes') : undefined
    setEdges((es) => es.some((e) => e.source === c.source && e.target === c.target) ? es : [...es, { id: `e${uid()}`, source: c.source!, target: c.target!, type: 'branch', sourceHandle: branch, data: { label: branch } }])
  }, [nodes, setEdges])
  const removeNode = (id: string) => { setNodes((ns) => ns.filter((n) => n.id !== id)); setEdges((es) => es.filter((e) => e.source !== id && e.target !== id)); setSel(null) }
  const removeEdge = (id: string) => { setEdges((es) => es.filter((e) => e.id !== id)); setSel(null) }
  const flipEdge = (id: string) => setEdges((es) => es.map((e) => (e.id === id && e.data?.label ? { ...e, sourceHandle: e.data.label === 'yes' ? 'no' : 'yes', data: { label: e.data.label === 'yes' ? 'no' : 'yes' } } : e)))
  const patch = (id: string, p: Partial<StepData>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...p } } : n)))
  const ensureVisible = (p: { x: number; y: number }) => {
    const vp = rf.getViewport(); const cw = canvasRef.current?.clientWidth ?? 800; const ch = canvasRef.current?.clientHeight ?? 600
    let { x, y } = vp
    const sx = p.x * vp.zoom + vp.x, sy = p.y * vp.zoom + vp.y, w = NODE_W * vp.zoom, h = 100 * vp.zoom
    if (sx + w > cw - 24) x = cw - 24 - (p.x + NODE_W) * vp.zoom; else if (sx < 24) x = 24 - p.x * vp.zoom
    if (sy + h > ch - 24) y = ch - 24 - (p.y + 100) * vp.zoom; else if (sy < 24) y = 24 - p.y * vp.zoom
    if (x !== vp.x || y !== vp.y) rf.setViewport({ x, y, zoom: vp.zoom }, { duration: 300 })
  }
  const viewportFor = useCallback((ns: { position: { x: number; y: number } }[], size: { w: number; h: number }) => {
    if (!ns.length) return { x: 40, y: 80, zoom: 1 }
    const minX = Math.min(...ns.map((n) => n.position.x)), maxX = Math.max(...ns.map((n) => n.position.x + NODE_W))
    const minY = Math.min(...ns.map((n) => n.position.y)), maxY = Math.max(...ns.map((n) => n.position.y + 100))
    const pad = 40
    const zoom = Math.min(1, Math.max(0.62, Math.min((size.w - pad * 2) / (maxX - minX), (size.h - pad * 2) / (maxY - minY))))
    const gw = (maxX - minX) * zoom, gh = (maxY - minY) * zoom
    const x = gw < size.w - pad * 2 ? (size.w - gw) / 2 - minX * zoom : pad - minX * zoom
    const y = gh < size.h - pad * 2 ? (size.h - gh) / 2 - minY * zoom : pad - minY * zoom
    return { x, y, zoom }
  }, [])
  const focus = useCallback((ns: { position: { x: number; y: number } }[], animate = false) => {
    const el = canvasRef.current; if (!el || !ns.length) return
    rf.setViewport(viewportFor(ns, { w: el.clientWidth, h: el.clientHeight }), { duration: animate ? 350 : 0 })
  }, [rf, viewportFor])
  const arrange = useCallback((ns?: FlowNode[], es?: BranchEdge[]) => {
    const srcN = ns ?? nodes; const srcE = es ?? edges
    const laid = autoLayout(srcN.map((n) => { const { ui: _ui, ...data } = n.data; return { id: n.id, type: 'step' as const, position: n.position, data } }), srcE.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.data?.label })))
    setNodes((cur) => cur.map((n) => ({ ...n, position: laid.find((l) => l.id === n.id)?.position ?? n.position })))
    setTimeout(() => focus(laid, true), 30)
  }, [nodes, edges, setNodes, focus])

  // ---------- persistence ----------
  const persist = (status?: Workflow['status']) => {
    const w: Workflow = { ...current(), status: status ?? meta.status, version: stored ? meta.version + 1 : 1 }
    upsertWorkflow(w); setMeta((m) => ({ ...m, status: w.status, version: w.version }))
    if (isNew) nav(`/workflows/${w.id}`, { replace: true })
    return w
  }
  const duplicate = () => { const w: Workflow = { ...current(), id: `wf-${Date.now().toString(36)}`, name: `${meta.name} copy`, status: 'draft', version: 1, lastRunAt: undefined }; upsertWorkflow(w); nav(`/workflows/${w.id}`) }
  const exportJson = () => { const blob = new Blob([JSON.stringify(current(), null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${meta.name.replace(/\s+/g, '-').toLowerCase()}.workflow.json`; a.click(); URL.revokeObjectURL(a.href) }
  // react-router allows one blocker per component: unsaved edits on a saved workflow, or a new canvas with real work on it
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editable && currentLocation.pathname !== nextLocation.pathname && (isNew && !stored ? nodes.length > 1 && !nextLocation.pathname.startsWith('/workflows/wf-') : dirty))
  const blocked = blocker.state === 'blocked' ? blocker : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (editable && dirty) persist() }
      if (e.key === 'Escape') { setSel(null); setAdding(null); setMenu(false) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  // ---------- running ----------
  const startTest = async () => {
    if (!runInput.trim() || problems.length) return
    const w = dirty || isNew ? persist() : (stored ?? current())
    setStarting(true); setSel(null); setDock('run')
    await startRun(w, runInput.trim(), 'Manual · builder', (id) => { setTestRunId(id); setStarting(false) })
    setStarting(false)
  }
  const decide = async (r: Run, d: 'approved' | 'rejected') => { decideRun(r.id, d); if (d === 'approved' && r.cursor) await resumeRun(r.id) }

  // ---------- assistant ----------
  const runAssistant = useCallback(async (text: string) => {
    if (!text.trim() || !apiKey) return
    setAssist({ input: '', busy: true, note: 'Designing the workflow…' })
    const existing = nodes.filter((n) => n.data.brick !== 'trigger')
    const mode = existing.length === 0 ? 'build' : 'extend'
    const sys = `You design automation flows for Beinex Co-Create. Steps: agent (an AI agent does work; "prompt" = step instructions; optional "agentId" from the list), logic (a plain-language yes/no condition in "sub"; the step after it on the "yes" branch runs when true; add a step with "branch":"no" for the false branch), human (a person approves; the run pauses), tool (call exactly one tool: ${TOOLS.filter((t) => t.category !== 'Reasoning').map((t) => t.name).join(', ')}${customTools.length ? ', ' + customTools.map((t) => t.name).join(', ') : ''}; "prompt" = guidance), notify (in-app notification of the latest result). Do not include a start/trigger step. Available agents: ${agents.map((a) => `${a.id} = ${a.name} (${a.description})`).join('; ') || 'none, so leave agentId out and write prompts'}. ${mode === 'build' ? 'Design the whole flow from the request, 2 to 6 steps.' : `The flow already has these steps in order: ${existing.map((n) => `${n.data.brick}:${n.data.label}`).join(' -> ')}. Add only the steps the request asks for; they go after the last step.`} Labels are 1-3 words. Reply ONLY with JSON: {"name":"short flow name","description":"one sentence","steps":[{"brick":"agent|logic|human|tool|notify","label":"...","sub":"condition text for logic only","prompt":"...","agentId":"...","tool":"...","branch":"no (optional)"}],"note":"one friendly sentence on what you built"}`
    let acc = ''
    try {
      for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: sys }, { role: 'user', content: text }], temperature: 0.2 })) if (ev.type === 'delta') acc += ev.text
      const j = JSON.parse(acc.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim())
      const steps: any[] = (j.steps ?? []).filter((s: any) => ['agent', 'logic', 'human', 'tool', 'notify'].includes(s.brick))
      if (!steps.length) throw new Error('empty')
      let ns = [...nodes]; let es = [...edges]
      let prev = ns.find((n) => n.data.brick === 'trigger') ?? ns[0]
      if (mode === 'extend') { const terminal = ns.filter((n) => n.data.brick !== 'trigger' && !es.some((e) => e.source === n.id)); prev = terminal[terminal.length - 1] ?? ns[ns.length - 1] }
      let lastLogic: FlowNode | undefined
      for (const s of steps) {
        const id = uid()
        const agent = s.agentId ? agents.find((a) => a.id === s.agentId) : undefined
        const data: StepData = { ...newStep(s.brick, { model: defaultModel, approver: approvers[0]?.id }), label: String(s.label || brickOf(s.brick).label).slice(0, 40), sub: s.brick === 'logic' ? String(s.sub ?? s.prompt ?? '') : '', prompt: s.brick === 'logic' ? undefined : s.prompt ? String(s.prompt) : undefined, ...(agent ? { agentId: agent.id, model: agent.model } : {}), ...(s.brick === 'tool' ? { tool: [...TOOLS, ...customTools].some((t) => t.name === s.tool) ? s.tool : 'save_document' } : {}) }
        const node: FlowNode = { id, type: 'step', position: { x: 0, y: 0 }, data: { ...data, ui: blankUi } }
        const fromNo = s.branch === 'no' && lastLogic
        const from = fromNo ? lastLogic! : prev
        const branch = from.data.brick === 'logic' ? (fromNo ? 'no' : 'yes') : undefined
        ns = [...ns, node]; if (from) es = [...es, { id: `e${uid()}`, source: from.id, target: id, type: 'branch', sourceHandle: branch, data: { label: branch } }]
        if (s.brick === 'logic') lastLogic = node
        prev = node
      }
      setNodes(ns); setEdges(es)
      if (mode === 'build') setMeta((m) => ({ ...m, name: (j.name && (m.name === 'Untitled workflow' || m.name === 'New workflow')) ? String(j.name).slice(0, 60) : m.name, description: j.description && !m.description ? String(j.description).slice(0, 160) : m.description }))
      setTimeout(() => arrange(ns, es), 20)
      setAssist({ input: '', busy: false, note: j.note ?? 'Done. Review each step on the right, then test it.' })
      setSel(null); setFlowTab('checks')
    } catch { setAssist({ input: text, busy: false, note: 'I could not turn that into steps. Try describing it as a sequence: research X, then check Y, then ask Z to approve.' }) }
  }, [apiKey, nodes, edges, agents, customTools, defaultModel, approvers, setNodes, setEdges, arrange])
  useEffect(() => { if (buildText && !builtRef.current && apiKey) { builtRef.current = true; runAssistant(buildText) } }, [buildText, apiKey, runAssistant])

  // ---------- drag and drop ----------
  const onDragOver = (e: DragEvent) => { if (e.dataTransfer.types.includes(DT)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) } }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragOver(false); const brick = e.dataTransfer.getData(DT) as Brick; if (!brick) return; const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }); addStep(brick, { position: { x: p.x - NODE_W / 2, y: p.y - 40 } }) }

  // ---------- render data ----------
  const rfNodes = useMemo<FlowNode[]>(() => nodes.map((n) => {
    const a = n.data.brick === 'agent' && n.data.agentId ? agents.find((x) => x.id === n.data.agentId) : undefined
    const ui: FlowUi = { line: lineFor(n.data), status: statusOf.get(n.id), problem: problems.some((p) => p.nodeId === n.id), editable, onAdd: editable ? (id, branch) => { setAdding({ after: id, branch }); setSel({ kind: 'node', id }); setDock('inspect') } : undefined,
      agent: a ? { name: a.name, icon: a.icon, color: a.color, thinking: thinkingOf({ model: a.model }, profiles, defaultModel)?.label } : undefined,
      approver: n.data.brick === 'human' ? users.find((u) => u.id === n.data.approver)?.name : undefined,
      schedule: n.data.brick === 'trigger' && meta.triggerType === 'schedule' ? `Every ${meta.schedule.every} · ${meta.schedule.at}` : undefined }
    return { ...n, selected: sel?.kind === 'node' && sel.id === n.id, data: { ...n.data, ui } }
  }), [nodes, agents, lineFor, statusOf, problems, editable, profiles, defaultModel, users, meta, sel])
  const rfEdges = useMemo<BranchEdge[]>(() => edges.map((e) => ({ ...e, selected: sel?.kind === 'edge' && sel.id === e.id, data: { ...e.data, active: statusOf.get(e.source) === 'ok' && (statusOf.get(e.target) === 'running'), editable, onDelete: removeEdge, onFlip: flipEdge } })), [edges, sel, statusOf, editable]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasTrigger = nodes.some((n) => n.data.brick === 'trigger')
  const statusTone = meta.status === 'live' ? 'ok' : meta.status === 'paused' ? 'warn' : undefined

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ---------- header ---------- */}
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0 relative z-20">
        <button onClick={() => nav('/workflows')} className="btn btn-ghost btn-icon" title="Back to workflows"><ArrowLeft size={16} /></button>
        <div className="flex items-center gap-2 min-w-0">
          <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={!editable} placeholder="Name this workflow" className="display font-bold text-[15px] bg-transparent outline-0 w-[260px] truncate rounded-md px-1 -mx-1 hover:bg-[var(--clay-dark)] focus:bg-[var(--clay-dark)] transition-colors" />
          <Chip tone={statusTone as any}>{meta.status === 'live' ? 'Live' : meta.status === 'paused' ? 'Paused' : 'Draft'} · v{meta.version}</Chip>
          {dirty && <span className="text-[11.5px] muted">Unsaved</span>}
        </div>
        <div className="flex-1" />
        <button onClick={() => { setSel(null); setDock('inspect'); setFlowTab('checks') }} className={cx('chip !h-8 hover:text-[var(--text)]', problems.length ? 'chip-warn' : 'chip-ok')}>{problems.length ? <><AlertTriangle size={12} /> {problems.length} to fix</> : <><CheckCircle2 size={12} /> Ready</>}</button>
        <button onClick={() => arrange()} className="btn btn-ghost btn-icon" title="Tidy up the layout"><LayoutGrid size={15} /></button>
        {editable && <Button onClick={() => persist()} disabled={!dirty}><Check size={13} /> Save</Button>}
        <Button variant="primary" onClick={() => { setSel(null); setDock(dock === 'run' ? 'inspect' : 'run') }} disabled={problems.length > 0} title={problems[0]?.text}><Play size={13} /> Test run</Button>
        {editable && (meta.status === 'live' ? <Button onClick={() => persist('paused')}><Pause size={13} /> Pause</Button> : <Button onClick={() => persist('live')} disabled={problems.length > 0} title={problems[0]?.text}>Publish</Button>)}
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="btn btn-ghost btn-icon" aria-label="More actions" aria-expanded={menu}><MoreHorizontal size={16} /></button>
          <AnimatePresence>{menu && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-2 w-[220px] pop rounded-[14px] p-1.5 z-30" onMouseLeave={() => setMenu(false)}>
              {editable && <button onClick={() => { setMenu(false); duplicate() }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
              <button onClick={() => { setMenu(false); exportJson() }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Download size={14} /> Export JSON</button>
              {stored && editable && <><div className="h-px bg-[var(--line)] my-1" /><button onClick={() => { setMenu(false); setConfirmDelete(true) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] text-[var(--danger)] hover:bg-[var(--clay-dark)]"><Trash2 size={14} /> Delete workflow</button></>}
            </motion.div>
          )}</AnimatePresence>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-3">
        {/* ---------- left rail: steps + assistant ---------- */}
        {editable && (
          <aside className="w-[212px] shrink-0 clay p-3 flex flex-col gap-3 min-h-0">
            <div className="px-1">
              <div className="text-[12.5px] font-semibold">Steps</div>
              <div className="text-[11.5px] muted leading-snug mt-0.5">{adding ? '' : 'Drag onto the canvas, or click to add after the selected step.'}</div>
            </div>
            <AnimatePresence>{adding && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flat p-2.5 text-[12px] flex items-start gap-2 border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]">
                <span className="flex-1">Adding after <b>{nameOf(adding.after)}</b>{adding.branch && <> on the <b className={adding.branch === 'yes' ? 'text-[var(--ok)]' : 'text-[var(--danger)]'}>{adding.branch === 'yes' ? 'Yes' : 'No'}</b> branch</>}. Pick a step.</span>
                <button onClick={() => setAdding(null)} className="muted hover:text-[var(--text)]"><X size={13} /></button>
              </motion.div>
            )}</AnimatePresence>
            <div className="flex flex-col gap-1.5 scroll -mx-1 px-1">
              {BRICKS.map((b) => {
                const disabled = b.soon || (b.id === 'trigger' && hasTrigger)
                return (
                  <button key={b.id} aria-label={b.soon ? `${b.label} (coming soon)` : `Add ${b.label} step`} disabled={disabled} draggable={!disabled} onDragStart={(e) => { e.dataTransfer.setData(DT, b.id); e.dataTransfer.effectAllowed = 'move' }}
                    onClick={() => addStep(b.id, adding ? { after: adding.after, branch: adding.branch } : selectedNode ? { after: selectedNode.id, branch: selectedNode.data.brick === 'logic' ? 'yes' : undefined } : { after: [...nodes].reverse().find((n) => !edges.some((e) => e.source === n.id))?.id })}
                    className={cx('brick-card flat p-2.5 flex items-center gap-2.5 text-left transition-all hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:-translate-y-px', disabled && 'opacity-50 cursor-not-allowed hover:translate-y-0')}>
                    <Tile color={b.color} size={30} radius={9}><b.icon size={14} /></Tile>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[12.5px] font-semibold">{b.label}{b.soon && <span className="chip !h-[18px] !text-[10px] !px-1.5">Soon</span>}{b.id === 'trigger' && hasTrigger && <span className="chip !h-[18px] !text-[10px] !px-1.5">Added</span>}</span><span className="block text-[11px] muted leading-snug truncate">{b.desc}</span></span>
                  </button>
                )
              })}
            </div>
            <div className="mt-auto pt-3 border-t hairline">
              <div className="flex items-center gap-1.5 text-[12.5px] font-semibold px-1"><Sparkles size={13} className="accent-ink" /> Co-Create Assistant</div>
              <div className="text-[11.5px] muted px-1 mt-0.5 leading-snug">{nodes.filter((n) => n.data.brick !== 'trigger').length === 0 ? 'Describe the workflow and I will build the steps.' : 'Tell me what to add and I will append the steps.'}</div>
              <div className="flat mt-2 p-1.5 pl-2.5 flex items-end gap-1.5 focus-within:border-[var(--accent)]">
                <textarea value={assist.input} onChange={(e) => setAssist({ ...assist, input: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runAssistant(assist.input) } }} rows={2} disabled={!apiKey || assist.busy} placeholder={apiKey ? 'Research a topic, draft a brief, then ask me to approve…' : 'Models are not available right now'} className="flex-1 bg-transparent outline-0 text-[12.5px] resize-none leading-snug py-1" />
                <button aria-label="Ask the assistant" onClick={() => runAssistant(assist.input)} disabled={!assist.input.trim() || assist.busy || !apiKey} className="btn btn-primary btn-sm btn-icon !rounded-full shrink-0">{assist.busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={14} />}</button>
              </div>
              {assist.note && <div className="text-[11.5px] muted px-1 mt-2 leading-snug">{assist.note}</div>}
            </div>
          </aside>
        )}

        {/* ---------- canvas ---------- */}
        <div ref={canvasRef} className={cx('flex-1 min-w-0 clay relative overflow-hidden transition-all', dragOver && 'drop-hint')} onDragOver={onDragOver} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
          {size && <ReactFlow<FlowNode, BranchEdge> defaultViewport={viewportFor(nodes, size)} nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeClick={(_, n) => select({ kind: 'node', id: n.id })} onEdgeClick={(_, e) => select({ kind: 'edge', id: e.id })} onPaneClick={() => { setSel(null); setAdding(null) }}
            onNodesDelete={(ds) => { if (ds.some((d) => d.id === sel?.id)) setSel(null) }} onEdgesDelete={(ds) => { if (ds.some((d) => d.id === sel?.id)) setSel(null) }}
            minZoom={0.3} maxZoom={1.6} proOptions={{ hideAttribution: true }}
            nodesDraggable={editable} nodesConnectable={editable} elementsSelectable deleteKeyCode={editable ? ['Backspace', 'Delete'] : null} selectionOnDrag={false} panOnScroll zoomOnDoubleClick={false} snapToGrid snapGrid={[12, 12]} defaultEdgeOptions={{ type: 'branch' }}>
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--muted)" style={{ opacity: 0.28 }} />
            <Controls showInteractive={false} position="bottom-right" />
            {nodes.length > 4 && <MiniMap pannable zoomable position="bottom-left" nodeColor={(n) => brickOf((n.data as FlowNode['data']).brick).color} nodeStrokeWidth={0} maskColor="transparent" style={{ width: 160, height: 90 }} />}
          </ReactFlow>}
          {nodes.length <= 1 && (
            <div className="absolute inset-x-0 top-[58%] grid place-items-center pointer-events-none">
              <div className="text-center max-w-[360px]">
                <div className="text-[13.5px] font-semibold">Build the workflow</div>
                <div className="text-[12.5px] muted mt-1 leading-relaxed">Hover Start and press <b>+</b>, drag a step from the left, or describe the whole flow to the assistant.</div>
              </div>
            </div>
          )}
          <AnimatePresence>{liveRun && liveRun.status === 'running' && dock !== 'run' && (
            <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={() => { setSel(null); setDock('run') }} className="absolute top-3 left-1/2 -translate-x-1/2 glass rounded-full h-9 pl-3 pr-4 flex items-center gap-2 text-[12.5px] font-medium"><Loader2 size={13} className="animate-spin accent-ink" /> Running · step {liveRun.steps.length + 1}</motion.button>
          )}</AnimatePresence>
        </div>

        {/* ---------- right dock ---------- */}
        <aside className="w-[324px] shrink-0 clay flex flex-col min-h-0 overflow-hidden">
          {dock === 'run' ? (
            <RunPanel run={liveRun} runs={wfRuns} input={runInput} setInput={setRunInput} onStart={startTest} starting={starting} problems={problems} apiKey={!!apiKey} dirty={dirty || isNew} canApprove={can(user, 'approve')} onDecide={decide} onPick={(id) => setTestRunId(id)} onReset={() => setTestRunId(null)} onClose={() => { setDock('inspect') }} nodes={nodes} />
          ) : selectedNode ? (
            <StepInspector node={selectedNode} editable={editable} onClose={() => setSel(null)} onRemove={() => removeNode(selectedNode.id)} patch={(p) => patch(selectedNode.id, p)} meta={meta} setMeta={setMeta} edges={edges} nodes={nodes} onAdd={(branch) => setAdding({ after: selectedNode.id, branch })} onSelect={(id) => select({ kind: 'node', id })} store={{ agents, councils, users, approvers, customTools, profiles, defaultModel }} lastRunAt={stored?.lastRunAt} />
          ) : selectedEdge ? (
            <div className="flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><span className="text-[13px] font-semibold flex-1">Connection</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSel(null)}><X size={14} /></button></div>
              <div className="p-4 flex flex-col gap-3 text-[13px]">
                <div><b>{nameOf(selectedEdge.source)}</b> <span className="muted">→</span> <b>{nameOf(selectedEdge.target)}</b></div>
                {selectedEdge.data?.label && <Field label="Branch" hint="Which answer of the condition follows this connection."><Segmented value={selectedEdge.data.label} onChange={() => flipEdge(selectedEdge.id)} items={[{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]} /></Field>}
                {editable && <Button onClick={() => removeEdge(selectedEdge.id)}><Trash2 size={13} /> Remove connection</Button>}
              </div>
            </div>
          ) : (
            <FlowPanel tab={flowTab} setTab={setFlowTab} meta={meta} setMeta={setMeta} editable={editable} problems={problems} onProblem={(p) => p.nodeId && select({ kind: 'node', id: p.nodeId })} runs={wfRuns} onPickRun={(id) => { setTestRunId(id); setDock('run') }} lastRunAt={stored?.lastRunAt} />
          )}
        </aside>
      </div>

      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete ${meta.name}?`} danger confirmLabel="Delete" body="Past runs stay under Runs. Schedules stop." onConfirm={() => { if (stored) deleteWorkflow(stored.id); nav('/workflows') }} />
      <Confirm open={!!blocked} onClose={() => blocked?.reset()} title="Leave without saving?" body="Your changes to this workflow will be lost." confirmLabel="Leave" danger onConfirm={() => blocked?.proceed()} />
    </div>
  )
}

/* ================= right dock: flow settings ================= */
function FlowPanel({ tab, setTab, meta, setMeta, editable, problems, onProblem, runs, onPickRun, lastRunAt }: { tab: 'setup' | 'checks' | 'history'; setTab: (t: 'setup' | 'checks' | 'history') => void; meta: any; setMeta: (m: any) => void; editable: boolean; problems: Problem[]; onProblem: (p: Problem) => void; runs: Run[]; onPickRun: (id: string) => void; lastRunAt?: number }) {
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 border-b hairline">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'setup', label: <span className="inline-flex items-center gap-1.5"><SlidersHorizontal size={12} /> Workflow</span> }, { id: 'checks', label: <span className="inline-flex items-center gap-1.5">{problems.length ? <AlertTriangle size={12} className="text-[var(--warn)]" /> : <CheckCircle2 size={12} className="text-[var(--ok)]" />} Checks{problems.length ? ` · ${problems.length}` : ''}</span> }, { id: 'history', label: <span className="inline-flex items-center gap-1.5"><History size={12} /> Runs{runs.length ? ` · ${runs.length}` : ''}</span> }]} />
      </div>
      <div className="p-4 flex flex-col gap-4 scroll">
        {tab === 'setup' && (
          <fieldset disabled={!editable} className="flex flex-col gap-4">
            <Field label="What this workflow does" hint="Shown in the list and to people who approve its steps."><Textarea rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} placeholder="e.g. Research a topic, draft a brief and ask for sign-off" /></Field>
            <Field label="How it starts">
              <Segmented value={meta.triggerType} onChange={(v) => setMeta({ ...meta, triggerType: v })} items={[{ id: 'manual', label: <span className="inline-flex items-center gap-1.5"><Zap size={12} /> By hand</span> }, { id: 'schedule', label: <span className="inline-flex items-center gap-1.5"><Clock size={12} /> On a schedule</span> }]} />
            </Field>
            {meta.triggerType === 'manual' ? <div className="text-[12px] muted -mt-2 leading-relaxed">Run it from Test run or the Workflows list, with an input each time. The input becomes the first message of the run.</div> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Every"><Select value={meta.schedule.every} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, every: e.target.value as Schedule['every'] } })}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week (Mondays)</option></Select></Field>
                  <Field label="At"><Input type="time" value={meta.schedule.at} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, at: e.target.value } })} /></Field>
                </div>
                <Field label="Input for each run"><Textarea rows={3} value={meta.schedule.input} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, input: e.target.value } })} placeholder="e.g. Check for news about our top 3 competitors" /></Field>
                <div className="text-[12px] muted leading-relaxed">Runs while Co-Create is open in a browser and the workflow is published. Last run: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'never'}.</div>
              </>
            )}
            <div className="flat p-3 text-[12px] muted leading-relaxed">Each step receives everything the earlier steps produced. Approval steps pause the run until the person decides. Agents that ask before acting queue their actions for approval.</div>
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
      <div className="text-[12px] muted truncate mt-1">{r.summary}</div>
    </button>
  )
}

/* ================= right dock: test run ================= */
function RunPanel({ run, runs, input, setInput, onStart, starting, problems, apiKey, dirty, canApprove, onDecide, onPick, onReset, onClose, nodes }: { run: Run | null; runs: Run[]; input: string; setInput: (v: string) => void; onStart: () => void; starting: boolean; problems: Problem[]; apiKey: boolean; dirty: boolean; canApprove: boolean; onDecide: (r: Run, d: 'approved' | 'rejected') => void; onPick: (id: string) => void; onReset: () => void; onClose: () => void; nodes: FlowNode[] }) {
  const nav = useNavigate()
  const [open, setOpen] = useState<number | null>(null)
  const [tab, setTab] = useState<'run' | 'history'>('run')
  useEffect(() => { if (run) setOpen(run.steps.length - 1) }, [run?.steps.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tick, setTick] = useState(0)
  useEffect(() => { setTick(0); if (run?.status !== 'running') return; const i = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(i) }, [run?.status, run?.id, run?.steps.length])
  const elapsed = run ? (run.status === 'running' ? `${(parseInt(run.duration) || 0) + tick}s` : run.duration) : ''
  const cursorNode = run?.status === 'running' && run.cursor ? nodes.find((n) => n.id === run.cursor) : undefined
  const waitingStep = run?.status === 'waiting' ? run.steps.find((s) => s.status === 'waiting') : undefined
  const approverName = run?.approver ? useApp.getState().users.find((u) => u.id === run.approver)?.name : undefined
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 border-b hairline flex items-center gap-2">
        <Segmented value={tab} onChange={setTab} items={[{ id: 'run', label: <span className="inline-flex items-center gap-1.5"><Play size={12} /> Test run</span> }, { id: 'history', label: <span className="inline-flex items-center gap-1.5"><History size={12} /> Runs{runs.length ? ` · ${runs.length}` : ''}</span> }]} />
        <button className="btn btn-ghost btn-sm btn-icon ml-auto" onClick={onClose} title="Close"><X size={14} /></button>
      </div>
      {tab === 'history' ? (
        <div className="p-3 flex flex-col gap-1.5 scroll">{runs.length === 0 ? <div className="py-10 text-center text-[12.5px] muted">No runs yet.</div> : runs.slice(0, 40).map((r) => <RunRow key={r.id} r={r} onClick={() => { onPick(r.id); setTab('run') }} />)}</div>
      ) : !run ? (
        <div className="p-4 flex flex-col gap-3">
          <Field label="Input" hint="Becomes the first message of the run. Every step sees it."><Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Research the latest changes to UAE corporate tax" autoFocus /></Field>
          {!apiKey && <div className="text-[12px] text-[var(--warn)]">Models are not available right now. Agent, condition and action steps will fail.</div>}
          {problems.length > 0 && <div className="text-[12px] text-[var(--warn)]">Fix the checks first: {problems[0].text}</div>}
          <Button variant="primary" onClick={onStart} disabled={!input.trim() || starting || problems.length > 0}>{starting ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} {starting ? 'Starting…' : 'Run now'}</Button>
          <div className="text-[11.5px] muted leading-relaxed">{dirty ? 'The workflow is saved first. ' : ''}Watch each step light up on the canvas. Steps that need a person pause the run until they decide.</div>
        </div>
      ) : (
        <div className="flex flex-col min-h-0">
          <div className="px-4 py-3 flex items-center gap-2 border-b hairline">
            <Chip tone={runTone(run.status)}>{run.status === 'running' ? <Loader2 size={11} className="animate-spin" /> : null} {runLabel[run.status]}</Chip>
            <span className="text-[12px] muted tabular-nums">{run.id} · {elapsed}{run.cost ? ` · $${run.cost.toFixed(3)}` : ''}</span>
            <button onClick={() => nav(`/runs?open=${run.id}`)} className="ml-auto text-[11.5px] accent-ink font-medium inline-flex items-center gap-1 hover:underline">Open <ExternalLink size={11} /></button>
          </div>
          <div className="p-3 flex flex-col gap-1.5 scroll">
            <div className="flat p-3 text-[12.5px]"><div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1">Input</div><div className="line-clamp-3">{run.input}</div></div>
            {run.steps.map((s, i) => {
              const b = brickOf(s.brick ?? 'agent'); const I = b.icon; const isOpen = open === i
              return (
                <div key={i} className={cx('flat overflow-hidden', s.status === 'failed' && 'border-[color-mix(in_srgb,var(--danger)_45%,var(--line))]')}>
                  <button onClick={() => setOpen(isOpen ? null : i)} className="w-full flex items-center gap-2.5 p-2.5 text-left">
                    <Tile color={b.color} size={26} radius={8}><I size={12} /></Tile>
                    <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold truncate">{s.name}</span><span className="block text-[11px] muted">{s.status === 'ok' ? (s.branch ? `Answered ${s.branch}` : 'Done') : s.status === 'waiting' ? 'Waiting for a decision' : s.status === 'failed' ? 'Failed' : 'Skipped'}{s.ms > 0 ? ` · ${(s.ms / 1000).toFixed(1)}s` : ''}{s.model ? ` · ${s.model}` : ''}</span></span>
                    {s.status === 'ok' ? <Check size={14} className="text-[var(--ok)]" /> : s.status === 'failed' ? <X size={14} className="text-[var(--danger)]" /> : <Hourglass size={13} className="text-[var(--warn)]" />}
                    <ChevronDown size={13} className={cx('muted transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  <AnimatePresence initial={false}>{isOpen && s.output && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden"><div className="px-3 pb-3 pt-0"><Md className="prose-chat text-[12px] leading-relaxed max-h-[260px] overflow-auto">{s.output}</Md></div></motion.div>}</AnimatePresence>
                </div>
              )
            })}
            {cursorNode && <div className="flat p-2.5 flex items-center gap-2.5 border-[color-mix(in_srgb,var(--accent)_40%,var(--line))]"><Loader2 size={15} className="animate-spin accent-ink" /><span className="text-[12.5px]">Working on <b>{cursorNode.data.label}</b>…</span></div>}
            {waitingStep && (
              <div className="flat p-3 border-[color-mix(in_srgb,var(--warn)_50%,var(--line))]">
                <div className="text-[12.5px] font-semibold flex items-center gap-1.5"><Hourglass size={13} className="text-[var(--warn)]" /> Waiting for {approverName ?? 'an approver'}</div>
                <div className="text-[12px] muted mt-1 leading-relaxed">The run resumes with the remaining steps once approved.</div>
                {canApprove && <div className="flex gap-2 mt-2.5"><Button variant="primary" size="sm" onClick={() => onDecide(run, 'approved')}><ThumbsUp size={12} /> Approve</Button><Button size="sm" onClick={() => onDecide(run, 'rejected')}><ThumbsDown size={12} /> Reject</Button></div>}
              </div>
            )}
            {run.status === 'approved' && run.cursor && !isRunning(run.id) && <Button size="sm" onClick={() => resumeRun(run.id)}><Play size={12} /> Resume remaining steps</Button>}
            {(run.status === 'completed' || run.status === 'failed' || run.status === 'rejected' || (run.status === 'approved' && !run.cursor)) && (
              <div className="flex gap-2 pt-1"><Button size="sm" onClick={onReset}><Play size={12} /> Run again</Button><Button size="sm" variant="ghost" onClick={() => nav(`/runs?open=${run.id}`)}><ListChecks size={12} /> Open in Runs</Button></div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ================= right dock: step inspector ================= */
type Store = { agents: ReturnType<typeof useApp.getState>['agents']; councils: ReturnType<typeof useApp.getState>['councils']; users: ReturnType<typeof useApp.getState>['users']; approvers: ReturnType<typeof useApp.getState>['users']; customTools: ReturnType<typeof useApp.getState>['customTools']; profiles: ReturnType<typeof useApp.getState>['profiles']; defaultModel: string }
function StepInspector({ node, editable, onClose, onRemove, patch, meta, setMeta, edges, nodes, onAdd, onSelect, store, lastRunAt }: { node: FlowNode; editable: boolean; onClose: () => void; onRemove: () => void; patch: (p: Partial<StepData>) => void; meta: any; setMeta: (m: any) => void; edges: BranchEdge[]; nodes: FlowNode[]; onAdd: (branch?: 'yes' | 'no') => void; onSelect: (id: string) => void; store: Store; lastRunAt?: number }) {
  const nav = useNavigate()
  const d = node.data; const b = brickOf(d.brick); const I = b.icon
  const { agents, councils, approvers, customTools, profiles, defaultModel } = store
  const agent = d.agentId ? agents.find((a) => a.id === d.agentId) : undefined
  const thinkingId = thinkingOf({ model: d.model ?? defaultModel }, profiles, defaultModel)?.id ?? 'balanced'
  const outs = edges.filter((e) => e.source === node.id)
  const branchTarget = (br: 'yes' | 'no') => { const e = outs.find((x) => x.data?.label === br); return e ? nodes.find((n) => n.id === e.target) : undefined }
  const next = outs.map((e) => nodes.find((n) => n.id === e.target)).filter(Boolean) as FlowNode[]
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 h-12 flex items-center gap-2 border-b hairline shrink-0">
        <Tile color={b.color} size={26} radius={8}><I size={13} /></Tile>
        <span className="text-[13px] font-semibold flex-1 truncate">{b.label}</span>
        {editable && d.brick !== 'trigger' && <button className="btn btn-ghost btn-sm btn-icon" onClick={onRemove} title="Delete step"><Trash2 size={14} /></button>}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} title="Close"><X size={14} /></button>
      </div>
      <fieldset disabled={!editable} className="p-4 flex flex-col gap-4 scroll">
        {d.brick !== 'trigger' && <Field label="Step name"><Input value={d.label} onChange={(e) => patch({ label: e.target.value })} placeholder={b.label} /></Field>}

        {d.brick === 'trigger' && (
          <>
            <Field label="How it starts">
              <Segmented value={meta.triggerType} onChange={(v) => setMeta({ ...meta, triggerType: v })} items={[{ id: 'manual', label: <span className="inline-flex items-center gap-1.5"><Zap size={12} /> By hand</span> }, { id: 'schedule', label: <span className="inline-flex items-center gap-1.5"><Clock size={12} /> On a schedule</span> }]} />
            </Field>
            {meta.triggerType === 'manual' ? <div className="text-[12px] muted -mt-2 leading-relaxed">Each run starts with an input you type. It becomes the first message every step can see.</div> : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Every"><Select value={meta.schedule.every} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, every: e.target.value } })}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week (Mondays)</option></Select></Field>
                  <Field label="At"><Input type="time" value={meta.schedule.at} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, at: e.target.value } })} /></Field>
                </div>
                <Field label="Input for each run"><Textarea rows={3} value={meta.schedule.input} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, input: e.target.value } })} placeholder="e.g. Check for news about our top 3 competitors" /></Field>
                <div className="text-[12px] muted leading-relaxed">Fires while Co-Create is open and the workflow is published. Last run: {lastRunAt ? new Date(lastRunAt).toLocaleString() : 'never'}.</div>
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
                <div className="text-[11.5px] muted leading-snug">Uses the agent's abilities, knowledge, thinking and independence.</div>
              </div>
            ) : (
              <Field label="Thinking" hint="How much effort this one-off step gets.">
                <Segmented value={thinkingId} onChange={(id) => patch({ model: profiles.find((p) => p.id === id)?.model ?? defaultModel })} items={THINKING.map((t) => ({ id: t.id, label: <span className="inline-flex items-center gap-1.5"><t.icon size={12} /> {t.label}</span> }))} />
                <div className="text-[11.5px] muted mt-1.5">Read-only abilities: web search, read pages, calculator, scripts, knowledge, save document.</div>
              </Field>
            )}
            <Field label={agent ? 'Extra instructions for this step' : 'What this step should do'} hint="It sees the input and everything earlier steps produced."><Textarea rows={5} value={d.prompt ?? ''} onChange={(e) => patch({ prompt: e.target.value })} placeholder={agent ? 'e.g. Focus on the last 30 days and keep it under 200 words' : 'e.g. Summarise the findings into a one-page brief with sources'} /></Field>
          </>
        )}

        {d.brick === 'logic' && (
          <>
            <Field label="Check that…" hint="Plain language. Judged against the latest step's result. Yes continues on the green branch, No on the red one."><Textarea rows={3} value={d.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} placeholder="e.g. the report mentions a price change" /></Field>
            <div className="flex flex-col gap-1.5">
              {(['yes', 'no'] as const).map((br) => { const t = branchTarget(br); return (
                <div key={br} className="flat p-2.5 flex items-center gap-2 text-[12.5px]">
                  <span className={cx('h-5 px-2 rounded-full text-[10.5px] font-semibold text-white', br === 'yes' ? 'bg-[var(--ok)]' : 'bg-[var(--danger)]')}>{br === 'yes' ? 'Yes' : 'No'}</span>
                  {t ? <button type="button" onClick={() => onSelect(t.id)} className="flex-1 text-left truncate font-medium hover:underline">→ {t.data.label}</button> : <span className="flex-1 muted">{br === 'yes' ? 'Nothing yet' : 'Ends the run'}</span>}
                  {editable && !t && <button type="button" onClick={() => onAdd(br)} className="text-[11.5px] accent-ink font-medium hover:underline">Add step</button>}
                </div>
              ) })}
            </div>
          </>
        )}

        {d.brick === 'human' && (
          <>
            <Field label="Who approves" hint="The run pauses here. They get a notification and decide under Runs or right in the test panel.">
              <Select value={d.approver ?? ''} onChange={(e) => patch({ approver: e.target.value || undefined })}><option value="">Choose a person</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select>
            </Field>
            <Field label="Note for the approver (optional)"><Input value={d.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} placeholder="e.g. Check the numbers before it is saved" /></Field>
          </>
        )}

        {d.brick === 'tool' && (
          <>
            <Field label="Tool to call" hint="Arguments are derived from the run so far by the Fast model, and the tool is called once.">
              <Select value={d.tool ?? 'save_document'} onChange={(e) => patch({ tool: e.target.value })}>
                {(['Knowledge', 'Web', 'Actions'] as const).map((cat) => <optgroup key={cat} label={cat}>{TOOLS.filter((t) => t.category === cat).map((t) => <option key={t.name} value={t.name}>{t.label}{t.write ? ' · asks a person' : ''}</option>)}</optgroup>)}
                {customTools.length > 0 && <optgroup label="Your API">{customTools.map((t) => <option key={t.name} value={t.name}>{t.label}</option>)}</optgroup>}
              </Select>
            </Field>
            <Field label="Guidance (optional)"><Textarea rows={3} value={d.prompt ?? ''} onChange={(e) => patch({ prompt: e.target.value })} placeholder="e.g. Title the document with today's date" /></Field>
          </>
        )}

        {d.brick === 'notify' && <div className="flat p-3 text-[12px] muted leading-relaxed">Sends an in-app notification with the latest result of the workflow. Everyone in the workspace sees it in Notifications.</div>}

        {d.brick === 'council' && (
          <>
            <div className="flat p-3 text-[12px] leading-relaxed"><span className="chip chip-accent !h-5 !text-[10.5px] mr-1.5">Coming soon</span>Councils, where several agents deliberate on one case, are being finished. Existing council steps still run.</div>
            {councils.length > 0 && <Field label="Council"><Select value={d.councilId ?? ''} onChange={(e) => patch({ councilId: e.target.value || undefined })}><option value="">Choose a council</option>{councils.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          </>
        )}

        {d.brick !== 'logic' && next.length > 0 && (
          <div className="pt-2 border-t hairline">
            <div className="text-[11px] font-semibold uppercase tracking-wider muted mb-1.5">Then</div>
            {next.map((n) => <button key={n.id} type="button" onClick={() => onSelect(n.id)} className="w-full flex items-center gap-2 text-[12.5px] py-1 hover:underline text-left"><Tile color={brickOf(n.data.brick).color} size={20} radius={6}>{(() => { const J = brickOf(n.data.brick).icon; return <J size={10} /> })()}</Tile><span className="truncate">{n.data.label}</span><ChevronRight size={12} className="muted ml-auto" /></button>)}
          </div>
        )}
        {d.brick !== 'logic' && editable && <button type="button" onClick={() => onAdd()} className="text-[12px] accent-ink font-medium text-left hover:underline inline-flex items-center gap-1"><Wand2 size={12} /> Add a step after this one</button>}
      </fieldset>
    </div>
  )
}
