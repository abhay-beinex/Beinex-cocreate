import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ReactFlow, Background, Controls, addEdge, useNodesState, useEdgesState, Handle, Position, type Node, type Edge, type Connection, type NodeProps, BackgroundVariant } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Zap, Sparkles, Users, GitFork, UserCheck, Wrench, Bell, ArrowUp, Play, Trash2, X, Check, Pause, Clock, ListChecks, AlertTriangle } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates, roleLabel, type Brick, type StepData, type Workflow, type Schedule } from '@/lib/data'
import { streamChat } from '@/lib/openrouter'
import { TOOLS } from '@/lib/tools'
import { startRun } from '@/lib/runner'
import { Button, Chip, Field, Input, Select, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { Page } from '@/components/motion'
import { AgentAvatar } from '@/components/AgentAvatar'
import { AbilityWells, ThinkingMeter } from '@/components/AgentBits'
import { INDEPENDENCE } from '@/lib/agentVocab'
import { Md } from '@/components/Md'

const bricks: { id: Brick; label: string; icon: typeof Zap; color: string }[] = [
  { id: 'trigger', label: 'Trigger', icon: Zap, color: '#64748b' }, { id: 'agent', label: 'Agent', icon: Sparkles, color: '#0ea5e9' }, { id: 'council', label: 'Council', icon: Users, color: '#6366f1' },
  { id: 'logic', label: 'Condition', icon: GitFork, color: '#8b5cf6' }, { id: 'human', label: 'Approval', icon: UserCheck, color: '#f59e0b' }, { id: 'tool', label: 'Action', icon: Wrench, color: '#10b981' }, { id: 'notify', label: 'Notify', icon: Bell, color: '#ec4899' },
]
const brickOf = (b: Brick) => bricks.find((x) => x.id === b)!
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
  const { workflows, agents, councils, upsertWorkflow, deleteWorkflow, runs, apiKey, defaultModel, models, users, customTools, profiles } = useApp()
  const isNew = workflowId === 'new'
  const stored = workflows.find((w) => w.id === workflowId)
  const template = workflowTemplates.find((t) => t.id === (params.get('template') ?? 'standard')) ?? workflowTemplates[0]
  const base = useMemo<Workflow>(() => stored ?? { id: `wf-${Date.now().toString(36)}`, name: template.id === 'blank' ? 'New workflow' : template.name, description: template.desc, status: 'draft', version: 1, triggerType: template.triggerType, schedule: template.schedule, autonomy: 2, nodes: template.nodes.map((n) => ({ ...n, data: { ...n.data, ...(n.data.brick === 'council' && params.get('council') ? { councilId: params.get('council')!, label: councils.find((c) => c.id === params.get('council'))?.name ?? n.data.label } : {}), ...(n.data.brick === 'human' ? { approver: users.find((u) => can(u, 'approve'))?.id } : {}) } })), edges: template.edges, updatedAt: '', createdBy: user.id }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(base.nodes as StepNode[])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(base.edges)
  const [meta, setMeta] = useState({ name: base.name, description: base.description, triggerType: base.triggerType, schedule: base.schedule ?? { every: 'day', at: '08:00', input: '' } as Schedule, autonomy: base.autonomy, status: base.status, version: base.version })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panel, setPanel] = useState<'none' | 'run' | 'trigger' | 'runs'>('none')
  const [copilot, setCopilot] = useState({ open: false, input: '', note: '' })
  const [runInput, setRunInput] = useState(base.schedule?.input || '')
  const [running, setRunning] = useState<string | null>(null)
  const editable = can(user, 'build')
  const approvers = users.filter((u) => can(u, 'approve'))

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId), [nodes, selectedId])
  const onConnect = useCallback((c: Connection) => setEdges((e) => addEdge({ ...c, id: `e${Date.now()}` }, e)), [setEdges])
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedId(null); setCopilot((c) => ({ ...c, open: false })) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])

  const current = (): Workflow => ({ ...base, ...meta, schedule: meta.triggerType === 'schedule' ? meta.schedule : undefined, nodes: nodes.map((n) => ({ id: n.id, type: 'step', position: n.position, data: n.data })), edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: typeof e.label === 'string' ? e.label : undefined })), updatedAt: new Date().toISOString().slice(0, 10) })
  const dirty = JSON.stringify({ ...current(), updatedAt: '', version: 0, lastRunAt: 0 }) !== JSON.stringify({ ...(stored ?? base), updatedAt: '', version: 0, lastRunAt: 0 })
  const problems = useMemo(() => {
    const out: string[] = []
    if (nodes.length === 0) out.push('Add at least one step.')
    if (!nodes.some((n) => n.data.brick === 'trigger')) out.push('Add a Trigger step so the workflow has a start.')
    nodes.forEach((n) => { if (n.data.brick === 'agent' && !n.data.agentId && !n.data.prompt) out.push(`"${n.data.label}": pick an agent or write step instructions.`); if (n.data.brick === 'council' && !n.data.councilId) out.push(`"${n.data.label}": pick a council.`); if (n.data.brick === 'human' && !n.data.approver) out.push(`"${n.data.label}": choose an approver.`); if (n.data.brick === 'logic' && !edges.some((e) => e.source === n.id && String(e.label ?? '').toLowerCase().startsWith('yes'))) out.push(`"${n.data.label}": connect a "yes" branch (label an edge yes/no by clicking it).`) })
    const orphan = nodes.filter((n) => n.data.brick !== 'trigger' && !edges.some((e) => e.target === n.id)); if (orphan.length) out.push(`Not connected: ${orphan.map((n) => n.data.label).join(', ')}.`)
    return out
  }, [nodes, edges])

  const addBrick = (b: Brick, label?: string, sub?: string, extra: Partial<StepData> = {}) => {
    const last = nodes[nodes.length - 1]
    const n: StepNode = { id: uid(), type: 'step', position: { x: last ? last.position.x + 280 : 40, y: last ? last.position.y : 160 }, data: { brick: b, label: label ?? brickOf(b).label, sub: sub ?? '', retries: 1, timeout: 60, costCap: 0.05, model: defaultModel, ...(b === 'human' ? { approver: approvers[0]?.id } : {}), ...(b === 'tool' ? { tool: 'save_document' } : {}), ...extra } }
    setNodes((ns) => [...ns, n]); if (last) setEdges((es) => [...es, { id: `e${Date.now()}`, source: last.id, target: n.id }]); setSelectedId(n.id); setPanel('none')
  }
  const patch = (p: Partial<StepData>) => selected && setNodes((ns) => ns.map((n) => (n.id === selected.id ? { ...n, data: { ...n.data, ...p } } : n)))
  const removeSelected = () => { if (!selected) return; setNodes((ns) => ns.filter((n) => n.id !== selected.id)); setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id)); setSelectedId(null) }
  const persist = (status?: Workflow['status']) => {
    const w: Workflow = { ...current(), status: status ?? meta.status, version: stored ? meta.version + 1 : 1 }
    upsertWorkflow(w); setMeta((m) => ({ ...m, status: w.status, version: w.version })); if (isNew) nav(`/workflows/${w.id}`, { replace: true })
    return w
  }
  const run = async () => {
    if (!runInput.trim()) return
    const w = dirty || isNew ? persist() : (stored ?? current())
    setRunning('starting'); setPanel('runs')
    const r = await startRun(w, runInput.trim(), 'Manual · editor')
    setRunning(null); setSelectedId(null); nav(`/runs?open=${r.id}`)
  }
  const runCopilot = async () => {
    const text = copilot.input.trim(); if (!text || !apiKey) return
    setCopilot((c) => ({ ...c, input: '', note: 'Thinking…' }))
    let acc = ''
    for await (const ev of streamChat({ key: apiKey, model: defaultModel, messages: [{ role: 'system', content: `You help build a workflow. Current steps in order: ${nodes.map((n) => `${n.data.brick}:${n.data.label}`).join(' -> ') || 'none'}. Bricks: trigger, agent, council, logic (condition, label edges yes/no), human (approval), tool (action: one of ${TOOLS.map((t) => t.name).join(', ')}), notify. Available agents: ${agents.map((a) => `${a.id} (${a.name})`).join(', ') || 'none'}. Reply ONLY with JSON: {"add":[{"brick":"...","label":"...","sub":"...","prompt":"optional step instructions","agentId":"optional","tool":"optional"}],"note":"one sentence"}.` }, { role: 'user', content: text }], temperature: 0.2 })) if (ev.type === 'delta') acc += ev.text
    try { const j = JSON.parse(acc.replace(/^```json?|```$/g, '').trim()); for (const a of j.add ?? []) if (bricks.some((b) => b.id === a.brick)) { addBrick(a.brick, a.label, a.sub, { prompt: a.prompt, agentId: a.agentId, tool: a.tool }); await new Promise((r) => setTimeout(r, 20)) } setCopilot((c) => ({ ...c, note: j.note ?? 'Done.' })) }
    catch { setCopilot((c) => ({ ...c, note: 'Could not parse the reply. Try rephrasing.' })) }
  }
  const wfRuns = runs.filter((r) => r.workflowId === base.id)

  return (
    <Page className="h-full flex flex-col gap-3">
      <header className="clay h-14 px-3 flex items-center gap-2 shrink-0">
        <button onClick={() => nav('/workflows')} className="btn btn-ghost btn-icon"><ArrowLeft size={16} /></button>
        <input value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} disabled={!editable} className="font-semibold text-[14px] bg-transparent outline-0 w-[240px]" />
        <Chip tone={meta.status === 'live' ? 'ok' : meta.status === 'paused' ? 'warn' : undefined}>{meta.status === 'live' ? 'Live' : meta.status === 'paused' ? 'Paused' : 'Draft'} · v{meta.version}</Chip>
        {dirty && <span className="text-[12px] muted">Unsaved</span>}
        <div className="flex-1" />
        <button onClick={() => { setPanel(panel === 'trigger' ? 'none' : 'trigger'); setSelectedId(null) }} className={cx('chip !h-8 hover:text-[var(--text)]', panel === 'trigger' && 'chip-accent')}>{meta.triggerType === 'schedule' ? <Clock size={12} /> : <Zap size={12} />} {meta.triggerType === 'schedule' ? `Every ${meta.schedule.every} at ${meta.schedule.at}` : 'Manual trigger'}</button>
        <button onClick={() => { setPanel(panel === 'runs' ? 'none' : 'runs'); setSelectedId(null) }} className={cx('chip !h-8 hover:text-[var(--text)]', panel === 'runs' && 'chip-accent')}><ListChecks size={12} /> {wfRuns.length} runs</button>
        {stored && editable && <button title="Delete workflow" onClick={() => { if (confirm('Delete this workflow?')) { deleteWorkflow(stored.id); nav('/workflows') } }} className="btn btn-ghost btn-icon"><Trash2 size={15} /></button>}
        {editable && <Button onClick={() => persist()} disabled={!dirty && !isNew}><Check size={13} /> Save</Button>}
        <Button variant="primary" onClick={() => { setPanel(panel === 'run' ? 'none' : 'run'); setSelectedId(null) }} disabled={problems.length > 0} title={problems[0]}><Play size={13} /> Run</Button>
        {editable && (meta.status === 'live' ? <Button onClick={() => persist('paused')}><Pause size={13} /> Pause</Button> : <Button onClick={() => persist('live')} disabled={problems.length > 0} title={problems[0]}>Publish</Button>)}
      </header>

      <div className="flex-1 min-h-0 clay relative overflow-hidden">
        <ReactFlow nodes={nodes.map((n) => ({ ...n, selected: n.id === selectedId }))} edges={edges.map((e) => ({ ...e, animated: !!running, labelStyle: { fill: 'var(--muted)', fontSize: 10, fontWeight: 600 }, labelBgStyle: { fill: 'var(--surface)' } }))}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, n) => { setSelectedId(n.id); setPanel('none') }} onPaneClick={() => setSelectedId(null)}
          onEdgeClick={(_, e) => { if (!editable) return; const l = prompt('Edge label (yes / no, or blank):', typeof e.label === 'string' ? e.label : ''); if (l !== null) setEdges((es) => es.map((x) => (x.id === e.id ? { ...x, label: l.trim() || undefined } : x))) }}
          nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} proOptions={{ hideAttribution: true }} nodesDraggable={editable} nodesConnectable={editable} deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--muted)" style={{ opacity: 0.3 }} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
        {nodes.length === 0 && <div className="absolute inset-0 grid place-items-center pointer-events-none muted text-[13px]">Add a step below, or ask the Co-Create Assistant.</div>}
        {problems.length > 0 && nodes.length > 0 && <div className="absolute top-3 left-3 glass rounded-[12px] px-3 py-2 text-[12px] flex items-start gap-2 max-w-[420px]"><AlertTriangle size={13} className="text-[var(--warn)] mt-0.5 shrink-0" /><div>{problems.slice(0, 2).map((p) => <div key={p}>{p}</div>)}{problems.length > 2 && <div className="muted">+{problems.length - 2} more</div>}</div></div>}

        {editable && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="absolute bottom-4 left-1/2 -translate-x-1/2 glass rounded-[16px] p-1.5 flex items-center gap-0.5">
            {bricks.map((b) => <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} key={b.id} onClick={() => addBrick(b.id)} title={`Add ${b.label}`} className="flex flex-col items-center gap-1 w-[60px] py-1.5 rounded-[11px] hover:bg-[var(--clay-dark)]"><Tile color={b.color} size={28} radius={9}><b.icon size={13} /></Tile><span className="text-[10.5px] font-medium muted">{b.label}</span></motion.button>)}
            <span className="w-px h-8 bg-[var(--line)] mx-1" />
            <motion.button whileHover={{ y: -2 }} onClick={() => setCopilot((c) => ({ ...c, open: !c.open }))} className={cx('flex flex-col items-center gap-1 w-[60px] py-1.5 rounded-[11px] hover:bg-[var(--clay-dark)]', copilot.open && 'bg-[var(--clay-dark)]')} disabled={!apiKey} title={apiKey ? 'Co-Create Assistant' : 'Models are not available right now'}><Tile color="#10385b" size={28} radius={9}><Sparkles size={13} /></Tile><span className="text-[10.5px] font-medium muted">Assistant</span></motion.button>
          </motion.div>
        )}

        <AnimatePresence>
          {copilot.open && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute bottom-24 left-1/2 -translate-x-1/2 w-[460px] glass rounded-[16px] p-2">
              <div className="text-[12px] font-semibold px-2 pt-1 pb-1.5 flex items-center gap-1.5"><Sparkles size={12} className="accent-ink" /> Co-Create Assistant <span className="muted font-normal">· adds steps from a sentence</span></div>
              {copilot.note && <div className="text-[12px] muted px-2 pb-2">{copilot.note}</div>}
              <div className="flex items-center gap-2 pl-2"><input autoFocus value={copilot.input} onChange={(e) => setCopilot((c) => ({ ...c, input: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && runCopilot()} placeholder="Add a condition that checks for risks, then an approval…" className="flex-1 bg-transparent outline-0 text-[13px]" /><button onClick={runCopilot} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button></div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selected && panel === 'none' && (
            <motion.aside key={selected.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.25 }} className="absolute top-3 right-3 bottom-3 w-[330px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline">
                <Tile color={brickOf(selected.data.brick).color} size={26} radius={8}>{(() => { const I = brickOf(selected.data.brick).icon; return <I size={13} /> })()}</Tile>
                <span className="text-[13px] font-semibold flex-1 truncate">{brickOf(selected.data.brick).label}</span>
                {editable && <button className="btn btn-ghost btn-sm btn-icon" onClick={removeSelected} title="Delete step"><Trash2 size={14} /></button>}
                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelectedId(null)}><X size={14} /></button>
              </div>
              <fieldset disabled={!editable} className="p-4 flex flex-col gap-4 scroll">
                <Field label="Name"><Input value={selected.data.label} onChange={(e) => patch({ label: e.target.value })} /></Field>
                {selected.data.brick === 'trigger' && <div className="text-[12px] muted">The trigger is set at the top: manual with an input, or a schedule. The input becomes the first message in the run context.</div>}
                {selected.data.brick === 'agent' && <>
                  <Field label="Agent" hint={selected.data.agentId ? 'Uses the agent’s instructions, tools, knowledge and model.' : 'No agent: the step runs with your instructions and the default read-only tools.'}><Select value={selected.data.agentId ?? ''} onChange={(e) => { const a = agents.find((x) => x.id === e.target.value); patch({ agentId: e.target.value || undefined, label: a?.name ?? selected.data.label, sub: a ? a.description.slice(0, 40) : selected.data.sub, model: a?.model ?? selected.data.model }) }}><option value="">Custom (no saved agent)</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.status === 'draft' ? ' (draft)' : ''}</option>)}</Select></Field>
                  {selected.data.agentId && (() => { const a = agents.find((x) => x.id === selected.data.agentId); if (!a) return null; const ind = INDEPENDENCE.find((i) => i.level === a.autonomy); return (
                    <div className="flat p-3 flex flex-col gap-2"><div className="flex items-center gap-2.5"><AgentAvatar name={a.name} icon={a.icon} color={a.color} size={30} radius={9} /><div className="min-w-0 flex-1"><div className="text-[13px] font-semibold truncate">{a.name}</div><div className="text-[11px] muted truncate">{a.status === 'live' ? 'Live' : 'Draft'} · {ind?.label}</div></div><button type="button" onClick={() => nav(`/agents/${a.id}`)} className="text-[11.5px] accent-ink font-medium hover:underline">Open</button></div><div className="flex items-center gap-3"><AbilityWells tools={a.tools} custom={customTools} max={6} size={22} /><ThinkingMeter model={a.model} profiles={profiles} defaultModel={defaultModel} /></div></div>
                  ) })()}
                  {!selected.data.agentId && <Field label="Model">{models.length ? <Select value={selected.data.model} onChange={(e) => patch({ model: e.target.value })}>{models.filter((m) => m.supported_parameters?.includes('tools')).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select> : <Input value={selected.data.model ?? ''} onChange={(e) => patch({ model: e.target.value })} />}</Field>}
                  <Field label="Step instructions" hint="What this step should produce from the context so far."><Textarea rows={5} value={selected.data.prompt ?? ''} onChange={(e) => patch({ prompt: e.target.value })} placeholder="e.g. Summarise the findings into a one-page brief" /></Field>
                </>}
                {selected.data.brick === 'council' && <Field label="Council"><Select value={selected.data.councilId ?? ''} onChange={(e) => { const c = councils.find((x) => x.id === e.target.value); patch({ councilId: e.target.value || undefined, label: c?.name ?? selected.data.label, sub: c ? `${c.members.length} members · ${c.mode}` : selected.data.sub }) }}><option value="">Choose a council</option>{councils.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>{councils.length === 0 && <div className="text-[11.5px] muted mt-1.5">No councils yet. Create one under Agents › Councils.</div>}</Field>}
                {selected.data.brick === 'logic' && <Field label="Condition" hint="Plain language. The Balanced model judges it against the latest step output and follows the edge labelled yes or no (click an edge to label it)."><Textarea rows={3} value={selected.data.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} placeholder="e.g. The report mentions a price change" /></Field>}
                {selected.data.brick === 'human' && <Field label="Approver" hint="The run pauses here. The approver gets a notification and decides under Runs › Approvals; the run resumes on approval."><Select value={selected.data.approver ?? ''} onChange={(e) => { const u = users.find((x) => x.id === e.target.value); patch({ approver: e.target.value || undefined, sub: u ? `${u.name} decides` : '' }) }}><option value="">Choose an approver</option>{approvers.map((u) => <option key={u.id} value={u.id}>{u.name} · {roleLabel[u.role]}</option>)}</Select></Field>}
                {selected.data.brick === 'tool' && <><Field label="Tool" hint="The Fast model derives the arguments from the run context and calls the tool once."><Select value={selected.data.tool ?? 'save_document'} onChange={(e) => patch({ tool: e.target.value, sub: e.target.value })}>{TOOLS.filter((t) => t.category !== 'Reasoning').map((t) => <option key={t.name} value={t.name}>{t.label}{t.write ? ' (queues approval)' : ''}</option>)}{customTools.map((t) => <option key={t.name} value={t.name}>{t.label} (custom)</option>)}</Select></Field><Field label="Guidance"><Textarea rows={3} value={selected.data.prompt ?? ''} onChange={(e) => patch({ prompt: e.target.value })} placeholder="e.g. Title the document with today’s date" /></Field></>}
                {selected.data.brick === 'notify' && <div className="text-[12px] muted">Sends an in-app notification with the latest step output. Everyone sees it in the bell menu.</div>}
                {selected.data.brick !== 'trigger' && selected.data.brick !== 'logic' && <Field label="Summary"><Input value={selected.data.sub ?? ''} onChange={(e) => patch({ sub: e.target.value })} placeholder="Shown on the step" /></Field>}
              </fieldset>
            </motion.aside>
          )}

          {panel === 'trigger' && (
            <motion.aside key="trigger" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute top-3 right-3 w-[330px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><Zap size={14} className="muted" /><span className="text-[13px] font-semibold flex-1">Trigger</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPanel('none')}><X size={14} /></button></div>
              <fieldset disabled={!editable} className="p-4 flex flex-col gap-4">
                <Segmented value={meta.triggerType} onChange={(v) => setMeta({ ...meta, triggerType: v })} items={[{ id: 'manual', label: 'Manual' }, { id: 'schedule', label: 'Schedule' }]} />
                {meta.triggerType === 'manual' ? <div className="text-[12px] muted">Run it from the Run button or the Workflows list, with an input each time.</div> : <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Every"><Select value={meta.schedule.every} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, every: e.target.value as Schedule['every'] } })}><option value="hour">Hour</option><option value="day">Day</option><option value="week">Week (Mondays)</option></Select></Field>
                    <Field label="At"><Input type="time" value={meta.schedule.at} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, at: e.target.value } })} /></Field>
                  </div>
                  <Field label="Input for each run"><Textarea rows={3} value={meta.schedule.input} onChange={(e) => setMeta({ ...meta, schedule: { ...meta.schedule, input: e.target.value } })} placeholder="e.g. Check for news about our top 3 competitors" /></Field>
                  <div className="text-[12px] muted">Schedules fire while {`${'Co-Create'}`} is open in a browser and the workflow is published. Last run: {stored?.lastRunAt ? new Date(stored.lastRunAt).toLocaleString() : 'never'}.</div>
                </>}
              </fieldset>
            </motion.aside>
          )}

          {panel === 'run' && (
            <motion.aside key="run" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute top-3 right-3 w-[360px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><Play size={14} className="muted" /><span className="text-[13px] font-semibold flex-1">Run workflow</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPanel('none')}><X size={14} /></button></div>
              <div className="p-4 flex flex-col gap-3">
                <Field label="Input" hint="Becomes the first message of the run."><Textarea rows={4} value={runInput} onChange={(e) => setRunInput(e.target.value)} placeholder="e.g. Research the latest changes to UAE corporate tax" autoFocus /></Field>
                {!apiKey && <div className="text-[12px] text-[var(--warn)]">Models are not available right now. Agent, council, condition and action steps will fail.</div>}
                {(dirty || isNew) && <div className="text-[12px] muted">The workflow is saved first.</div>}
                <Button variant="primary" onClick={run} disabled={!runInput.trim() || !!running}><Play size={13} /> {running ? 'Starting…' : 'Run now'}</Button>
                <div className="text-[11.5px] muted">Progress is shown under Runs. Steps that need a person pause the run until they decide.</div>
              </div>
            </motion.aside>
          )}

          {panel === 'runs' && (
            <motion.aside key="runs" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="absolute top-3 right-3 bottom-3 w-[360px] glass rounded-[18px] flex flex-col">
              <div className="px-4 h-12 flex items-center gap-2 border-b hairline"><ListChecks size={14} className="muted" /><span className="text-[13px] font-semibold flex-1">Runs of this workflow</span><button className="btn btn-ghost btn-sm btn-icon" onClick={() => setPanel('none')}><X size={14} /></button></div>
              <div className="p-3 flex flex-col gap-2 scroll">
                {wfRuns.length === 0 && <div className="text-[12.5px] muted p-3 text-center">No runs yet.</div>}
                {wfRuns.slice(0, 30).map((r) => (
                  <button key={r.id} onClick={() => nav(`/runs?open=${r.id}`)} className="flat p-3 text-left hover:bg-[var(--surface)]">
                    <div className="flex items-center gap-2 text-[12.5px]"><span className="font-semibold">{r.id}</span><Chip tone={r.status === 'waiting' ? 'warn' : r.status === 'failed' || r.status === 'rejected' ? 'danger' : r.status === 'running' ? 'accent' : 'ok'} className="capitalize">{r.status}</Chip><span className="muted ml-auto">{r.started}</span></div>
                    <div className="text-[12px] muted truncate mt-1">{r.summary}</div>
                    {r.status === 'running' && r.steps.length > 0 && <div className="text-[11.5px] accent-ink mt-1">Step {r.steps.length}: {r.steps[r.steps.length - 1].name}…</div>}
                    {r.steps.length > 0 && r.status !== 'running' && <Md className="prose-chat text-[11.5px] muted mt-1 line-clamp-3">{[...r.steps].reverse().find((s) => s.output)?.output?.slice(0, 200) ?? ''}</Md>}
                  </button>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </Page>
  )
}
