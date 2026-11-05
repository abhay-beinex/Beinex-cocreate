import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactFlow, Background, Controls, addEdge, useNodesState, useEdgesState, Handle, Position, type Node, type Edge, type Connection, type NodeProps, BackgroundVariant } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Md } from '@/components/Md'
import { ArrowLeft, Zap, Sparkles, Users, GitFork, UserCheck, Wrench, Bell, ArrowUp, Play, Trash2, X, Check, Pause } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates, type Brick, type StepData, type Workflow, type Run, type RunStep } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { runAgentTurn } from '@/lib/agentRun'
import { Button, Chip, Field, Input, Select, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { Page } from '@/components/motion'

const bricks: { id: Brick; label: string; icon: typeof Zap; color: string }[] = [
  { id: 'trigger', label: 'Trigger', icon: Zap, color: '#64748b' }, { id: 'agent', label: 'Agent', icon: Sparkles, color: '#0ea5e9' }, { id: 'council', label: 'Council', icon: Users, color: '#6366f1' },
  { id: 'logic', label: 'Condition', icon: GitFork, color: '#8b5cf6' }, { id: 'human', label: 'Approval', icon: UserCheck, color: '#f59e0b' }, { id: 'tool', label: 'Action', icon: Wrench, color: '#10b981' }, { id: 'notify', label: 'Notify', icon: Bell, color: '#ec4899' },
]
const brickOf = (b: Brick) => bricks.find((x) => x.id === b)!
const DEFAULT_STEP_TOOLS = ['web_search', 'read_url', 'calculate', 'run_javascript', 'current_datetime', 'search_knowledge', 'save_document']
type StepNode = Node<StepData, 'step'>

function StepNodeView({ data, selected }: NodeProps<StepNode>) {
  const b = brickOf(data.brick); const Icon = b.icon
  return (
    <div className={cx('w-[200px] px-3 py-2.5 rounded-[14px] flex items-center gap-2.5 bg-[var(--surface-2)] border transition-all', selected ? 'border-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]' : 'hairline shadow-[0_8px_18px_-12px_var(--clay-drop)]')}>
      <Handle type="target" position={Position.Left} />
      <Tile color={b.color} size={30} radius={9}><Icon size={14} /></Tile>
      <span className="min-w-0"><span className="block text-[12.5px] font-semibold truncate">{data.label}</span><span className="block text-[11px] muted truncate">{data.sub ?? b.label}</span></span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
const nodeTypes = { step: StepNodeView }
const uid = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`

export default function WorkflowEditor() {
  const { workflowId } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const user = useUser()!
  const { workflows, agents, councils, upsertWorkflow, deleteWorkflow, addRun, apiKey, defaultModel, models, libraries, users } = useApp()
  const isNew = workflowId === 'new'
  const stored = workflows.find((w) => w.id === workflowId)
  const template = workflowTemplates.find((t) => t.id === (params.get('template') ?? 'standard')) ?? workflowTemplates[0]
  const base = useMemo<Workflow>(() => stored ?? { id: `wf-${Date.now().toString(36)}`, name: 'New workflow', description: '', status: 'draft', version: 1, trigger: template.trigger, autonomy: 2, nodes: template.nodes.map((n) => ({ ...n, data: { ...n.data, ...(n.data.brick === 'council' && params.get('council') ? { councilId: params.get('council')!, label: councils.find((c) => c.id === params.get('council'))?.name ?? n.data.label } : {}) } })), edges: template.edges, runsWeek: 0, straightThrough: 0, updatedAt: '', createdBy: user.id }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(base.nodes as StepNode[])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(base.edges)
  const [meta, setMeta] = useState({ name: base.name, description: base.description, trigger: base.trigger, autonomy: base.autonomy, status: base.status, version: base.version })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'configure' | 'advanced'>('configure')
  const [copilot, setCopilot] = useState<{ open: boolean; input: string; note: string }>({ open: false, input: '', note: '' })
  const [test, setTest] = useState<{ open: boolean; input: string; running: boolean; active: number; log: RunStep[] }>({ open: false, input: 'Research the current state of enterprise AI agent platforms and summarise the top three trends.', running: false, active: -1, log: [] })
  const editable = can(user, 'build')

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId])
  const onConnect = useCallback((c: Connection) => setEdges((e) => addEdge({ ...c, id: `e${Date.now()}` }, e)), [setEdges])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedId(null); setCopilot((c) => ({ ...c, open: false })) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])

  const order = useMemo(() => {
    const out: StepNode[] = []; const seen = new Set<string>()
    const start = nodes.find((n) => !edges.some((e) => e.target === n.id)) ?? nodes[0]
    const walk = (n?: StepNode) => { if (!n || seen.has(n.id)) return; seen.add(n.id); out.push(n); edges.filter((e) => e.source === n.id).forEach((e) => walk(nodes.find((x) => x.id === e.target))) }
    walk(start); nodes.forEach((n) => walk(n)); return out
  }, [nodes, edges])

  const addBrick = (b: Brick, label?: string, sub?: string) => {
    const last = order[order.length - 1]
    const n: StepNode = { id: uid(), type: 'step', position: { x: last ? last.position.x + 280 : 40, y: last ? last.position.y : 160 }, data: { brick: b, label: label ?? brickOf(b).label, sub: sub ?? '', retries: 1, timeout: 60, costCap: 0.05, model: defaultModel } }
    setNodes((ns) => [...ns, n]); if (last) setEdges((es) => [...es, { id: `e${Date.now()}`, source: last.id, target: n.id }]); setSelectedId(n.id)
  }
  const patch = (p: Partial<StepData>) => selected && setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...p } } : n)))
  const removeSelected = () => { if (!selected) return; setNodes((ns) => ns.filter((n) => n.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSelectedId(null) }

  const persist = (status?: Workflow['status']) => {
    const w: Workflow = { ...base, ...meta, status: status ?? meta.status, version: stored ? meta.version + 1 : 1, nodes: nodes.map((n) => ({ id: n.id, type: 'step', position: n.position, data: n.data })), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })), updatedAt: new Date().toISOString().slice(0, 10) }
    upsertWorkflow(w); setMeta((m) => ({ ...m, status: w.status, version: w.version })); if (isNew) nav(`/workflows/${w.id}`, { replace: true })
  }

  const runTest = async () => {
    setTest((t) => ({ ...t, running: true, log: [], active: 0 }))
    const log: RunStep[] = []
    let context = test.input
    const t0 = Date.now()
    for (let i = 0; i < order.length; i++) {
      const n = order[i]; setTest((t) => ({ ...t, active: i }))
      const s0 = Date.now()
      let step: RunStep = { name: n.data.label, ms: 0, status: 'ok' }
      if ((n.data.brick === 'agent' || n.data.brick === 'council') && apiKey) {
        const a = agents.find((x) => x.id === n.data.agentId)
        const instr = a?.instructions ?? n.data.prompt ?? 'Process the input and summarise the result in under 80 words.'
        let out = ''
        try {
          for await (const ev of runAgentTurn({ key: apiKey, model: a?.model ?? n.data.model ?? defaultModel, instructions: instr + (n.data.prompt ? `\n\nStep instructions: ${n.data.prompt}` : '') + '\n\nBe brief (under 100 words).', tools: a?.tools ?? DEFAULT_STEP_TOOLS, libraries: libraries.filter((l) => (a ? a.knowledge.includes(l.id) : l.id === 'company')), history: [{ role: 'user', content: context }], maxRounds: 4 })) {
            if (ev.type === 'text') { out += ev.text; setTest((t) => ({ ...t, log: [...log, { ...step, output: out }] })) }
            if (ev.type === 'error') { out += `Error: ${ev.message}`; step.status = 'failed' }
          }
        } catch (e: any) { out += `Error: ${e.message}`; step.status = 'failed' }
        context = `${context}\n\nResult of "${n.data.label}": ${out}`
        step = { ...step, model: (a?.model ?? n.data.model ?? '').split('/')[1], output: out, tokens: Math.round(out.length / 3.5) + 400 }
      } else if (n.data.brick === 'agent' || n.data.brick === 'council') {
        await new Promise((r) => setTimeout(r, 400)); step = { ...step, status: 'skipped', output: 'Skipped: connect an OpenRouter key in Settings to run agent steps.' }
      } else if (n.data.brick === 'human') {
        step = { ...step, status: 'waiting', output: 'Waiting for a human approver. The test run stops here; the run is queued under Runs › Approvals.' }
        step.ms = Date.now() - s0; log.push(step); setTest((t) => ({ ...t, log: [...log] })); break
      } else if (n.data.brick === 'logic') {
        await new Promise((r) => setTimeout(r, 400)); step.output = `Condition "${n.data.sub || n.data.label}" evaluated on the current context.`
      } else if (n.data.brick === 'tool') {
        await new Promise((r) => setTimeout(r, 500)); step.output = 'External action simulated. In a live run this executes only after approval.'
      } else { await new Promise((r) => setTimeout(r, 350)); step.output = n.data.brick === 'trigger' ? `Triggered with: ${test.input.slice(0, 120)}` : 'Notification sent to Teams and the audit log sealed.' }
      step.ms = Date.now() - s0; log.push(step); setTest((t) => ({ ...t, log: [...log] }))
    }
    const waiting = log.some((s) => s.status === 'waiting'); const failed = log.some((s) => s.status === 'failed')
    const run: Run = { id: `R-${1300 + Math.floor(Math.random() * 600)}`, workflowId: base.id, workflow: meta.name, trigger: 'Test run · manual', status: waiting ? 'waiting' : failed ? 'failed' : 'completed', started: new Date().toISOString().slice(0, 16).replace('T', ' '), duration: `${Math.round((Date.now() - t0) / 1000)}s`, cost: Math.round(log.reduce((a, s) => a + (s.tokens ?? 0), 0) * 0.000004 * 1000) / 1000, steps: log, summary: test.input.slice(0, 90) }
    addRun(run); setTest((t) => ({ ...t, running: false, active: -1 }))
  }

  const runCopilot = async () => {
    const text = copilot.input.trim(); if (!text) return
    if (!apiKey) { setCopilot((c) => ({ ...c, note: 'Connect an OpenRouter key in Settings to use the copilot.' })); return }
    setCopilot((c) => ({ ...c, input: '', note: 'Thinking…' }))
    let acc = ''
    for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: `You help build a governed workflow. Current steps in order: ${order.map((n) => `${n.data.brick}:${n.data.label}`).join(' -> ') || 'none'}. Bricks: trigger, agent, council, logic, human, tool, notify. Available agents: ${agents.map((a) => `${a.id} (${a.name})`).join(', ')}. Reply ONLY with JSON: {"add":[{"brick":"...","label":"...","sub":"...","agentId":"optional"}],"note":"one sentence"}.` }, { role: 'user', content: text }], temperature: 0.2 })) if (ev.type === 'delta') acc += ev.text
    try {
      const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim())
      for (const a of j.add ?? []) if (bricks.some((b) => b.id === a.brick)) { addBrick(a.brick, a.label, a.sub); await new Promise((r) => setTimeout(r, 20)); if (a.agentId) setNodes((ns) => ns.map((n, i) => (i === ns.length - 1 ? { ...n, data: { ...n.data, agentId: a.agentId } } : n))) }
      setCopilot((c) => ({ ...c, note: j.note ?? 'Done.' }))
    } catch { setCopilot((c) => ({ ...c, note: 'Could not parse the reply. Try rephrasing.' })) }
  }

  const activeId = test.active >= 0 ? order[test.active]?.id : null

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => nav('/workflows')} className="btn btn-ghost btn-icon"><ArrowLeft size={16} /></button>
        <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={!editable} className="font-semibold text-[14px] bg-transparent outline-0 w-[260px]" />
        <Chip tone={meta.status === 'live' ? 'ok' : meta.status === 'paused' ? 'warn' : undefined}>{meta.status === 'live' ? 'Live' : meta.status === 'paused' ? 'Paused' : 'Draft'} · v{meta.version}</Chip>
        <div className="flex-1" />
        <Segmented value={String(meta.autonomy) as '1' | '2' | '3'} onChange={(v) => setMeta({ ...meta, autonomy: Number(v) as 1 | 2 | 3 })} items={[{ id: '1', label: 'Suggest' }, { id: '2', label: 'Approve then act' }, { id: '3', label: 'Act within limits' }]} />
        <Button onClick={() => setTest((t) => ({ ...t, open: !t.open }))}><Play size={13} /> Test</Button>
        {stored && editable && <button title="Delete workflow" onClick={() => { if (confirm('Delete this workflow?')) { deleteWorkflow(stored.id); nav('/workflows') } }} className="btn btn-ghost btn-icon"><Trash2 size={15} /></button>}
        {editable && <Button onClick={() => persist()}><Check size={13} /> Save</Button>}
        {editable && (meta.status === 'live' ? <Button onClick={() => persist('paused')}><Pause size={13} /> Pause</Button> : <Button variant="primary" onClick={() => persist('live')}>Publish</Button>)}
      </header>

      <div className="flex-1 min-h-0 clay relative overflow-hidden">
        <ReactFlow nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedId, className: n.id === activeId ? 'animate-pulse' : '' }))}
          edges={edges.map((e) => ({ ...e, animated: test.running, labelStyle: { fill: 'var(--muted)', fontSize: 10, fontWeight: 600 }, labelBgStyle: { fill: 'var(--surface)' } }))}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, n) => setSelectedId(n.id)} onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} proOptions={{ hideAttribution: true }} nodesDraggable={editable} nodesConnectable={editable}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--muted)" style={{ opacity: 0.3 }} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        {nodes.length === 0 && <div className="absolute inset-0 grid place-items-center pointer-events-none muted text-[13px]">Add a step below, or ask the copilot.</div>}

        <div className="absolute top-3 left-3 glass rounded-[14px] px-3 h-9 flex items-center gap-2 text-[12px]"><Zap size={12} className="muted" /><input value={meta.trigger} onChange={(e) => setMeta({ ...meta, trigger: e.target.value })} className="bg-transparent outline-0 w-[200px]" placeholder="Trigger (e.g. Email · ap-inbox)" /></div>

        {editable && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 glass rounded-[16px] p-1.5 flex items-center gap-0.5">
            {bricks.map((b) => (
              <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} key={b.id} onClick={() => addBrick(b.id)} title={`Add ${b.label}`} className="flex flex-col items-center gap-1 w-[60px] py-1.5 rounded-[11px] hover:bg-[var(--clay-dark)]">
                <Tile color={b.color} size={28} radius={9}><b.icon size={13} /></Tile><span className="text-[10.5px] font-medium muted">{b.label}</span>
              </motion.button>
            ))}
            <span className="w-px h-8 bg-[var(--line)] mx-1" />
            <motion.button whileHover={{ y: -2 }} onClick={() => setCopilot((c) => ({ ...c, open: !c.open }))} className={cx('flex flex-col items-center gap-1 w-[60px] py-1.5 rounded-[11px] hover:bg-[var(--clay-dark)]', copilot.open && 'bg-[var(--clay-dark)]')}>
              <Tile color="#10385b" size={28} radius={9}><Sparkles size={13} /></Tile><span className="text-[10.5px] font-medium muted">Copilot</span>
            </motion.button>
          </motion.div>
        )}

        <AnimatePresence>
          {copilot.open && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[460px] glass rounded-[16px] p-2">
              {copilot.note && <div className="text-[12px] muted px-2 pb-2">{copilot.note}</div>}
              <div className="flex items-center gap-2 pl-2">
                <input autoFocus value={copilot.input} onChange={(e) => setCopilot((c) => ({ ...c, input: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && runCopilot()} placeholder="Add a council review after the agent…" className="flex-1 bg-transparent outline-0 text-[13px]" />
                <button onClick={runCopilot} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selected && !test.open && (
            <motion.aside key={selected.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="absolute top-3 right-3 bottom-3 w-[320px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline">
                <Tile color={brickOf(selected.data.brick).color} size={26} radius={8}>{(() => { const I = brickOf(selected.data.brick).icon; return <I size={13} /> })()}</Tile>
                <span className="text-[13px] font-semibold flex-1 truncate">{brickOf(selected.data.brick).label}</span>
                {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={removeSelected} title="Delete step"><Trash2 size={14} /></button>}
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelectedId(null)}><X size={14} /></button>
              </div>
              <div className="px-4 pt-3"><Segmented value={tab} onChange={setTab} items={[{ id: 'configure', label: 'Configure' }, { id: 'advanced', label: 'Advanced' }]} /></div>
              <div className="p-4 flex flex-col gap-4 scroll">
                {tab === 'configure' ? <>
                  <Field label="Name"><Input value={selected.data.label} onChange={(e) => patch({ label: e.target.value })} /></Field>
                  <Field label="Summary"><Input value={selected.data.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} /></Field>
                  {selected.data.brick === 'agent' && <Field label="Agent"><Select value={selected.data.agentId ?? ''} onChange={(e) => { const a = agents.find((x) => x.id === e.target.value); patch({ agentId: e.target.value || undefined, label: a?.name ?? selected.data.label, model: a?.model ?? selected.data.model }) }}><option value="">Custom prompt</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
                  {selected.data.brick === 'council' && <Field label="Council"><Select value={selected.data.councilId ?? ''} onChange={(e) => { const c = councils.find((x) => x.id === e.target.value); patch({ councilId: e.target.value || undefined, label: c?.name ?? selected.data.label, sub: c ? `${c.members.length} members · ${c.mode}` : selected.data.sub }) }}><option value="">Choose a council</option>{councils.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
                  {(selected.data.brick === 'agent' || selected.data.brick === 'council') && <>
                    {!selected.data.agentId && <Field label="Model">{models.length ? <Select value={selected.data.model} onChange={(e) => patch({ model: e.target.value })}>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={selected.data.model ?? ''} onChange={(e) => patch({ model: e.target.value })} />}</Field>}
                    <Field label="Step instructions"><Textarea rows={4} value={selected.data.prompt ?? ''} onChange={(e) => patch({ prompt: e.target.value })} placeholder="What should this step do with the input?" /></Field>
                  </>}
                  {selected.data.brick === 'human' && <Field label="Approver"><Select value={selected.data.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })}>{users.filter((u) => u.role === 'approver' || u.role === 'security').map((u) => <option key={u.id} value={`${u.name.split(' ')[0]} decides`}>{u.name}</option>)}</Select><div className="text-[11.5px] muted mt-1.5">A person decides here before anything downstream runs, at any autonomy level.</div></Field>}
                  {selected.data.brick === 'logic' && <Field label="Condition"><Input value={selected.data.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} placeholder="amount > 50000" /></Field>}
                </> : <>
                  <Field label="Retries"><Input type="number" value={selected.data.retries} onChange={(e) => patch({ retries: +e.target.value })} /></Field>
                  <Field label="Timeout (seconds)"><Input type="number" value={selected.data.timeout} onChange={(e) => patch({ timeout: +e.target.value })} /></Field>
                  <Field label="Cost cap per run ($)"><Input type="number" step="0.01" value={selected.data.costCap} onChange={(e) => patch({ costCap: +e.target.value })} /></Field>
                  {(selected.data.retries ?? 1) > 1 && <div className="text-[12px] muted">Lowering retries to 1 cuts the estimated cost of this step by about 28%. <button className="accent-ink font-medium" onClick={() => patch({ retries: 1 })}>Apply</button></div>}
                </>}
              </div>
            </motion.aside>
          )}
          {test.open && (
            <motion.aside key="test" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="absolute top-3 right-3 bottom-3 w-[360px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><Play size={14} className="muted" /><span className="text-[13px] font-semibold flex-1">Test run</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setTest((t) => ({ ...t, open: false }))}><X size={14} /></button></div>
              <div className="p-4 flex flex-col gap-3 scroll">
                <Field label="Input"><Textarea rows={3} value={test.input} onChange={(e) => setTest((t) => ({ ...t, input: e.target.value }))} /></Field>
                <Button variant="primary" onClick={runTest} disabled={test.running || order.length === 0}><Play size={13} /> {test.running ? 'Running…' : 'Run'}</Button>
                {!apiKey && <div className="text-[11.5px] muted">Without an OpenRouter key, agent steps are skipped and the rest is simulated.</div>}
                <ol className="flex flex-col gap-2">
                  {test.log.map((s, i) => (
                    <motion.li key={i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flat p-3">
                      <div className="flex items-center gap-2 text-[12.5px] font-semibold"><span className={cx('w-2 h-2 rounded-full', s.status === 'ok' ? 'bg-[var(--ok)]' : s.status === 'failed' ? 'bg-[var(--danger)]' : 'bg-[var(--warn)]')} />{s.name}<span className="muted font-normal ml-auto">{s.model ? `${s.model} · ` : ''}{(s.ms / 1000).toFixed(1)}s</span></div>
                      {s.output && <Md className="prose-chat text-[12px] muted mt-1.5">{s.output}</Md>}
                    </motion.li>
                  ))}
                  {test.running && test.active >= test.log.length && <li className="text-[12px] muted px-1">Running {order[test.active]?.data.label}…</li>}
                </ol>
                {!test.running && test.log.length > 0 && <div className="text-[11.5px] muted">Saved under Runs.</div>}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </Page>
  )
}
