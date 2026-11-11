// Workflows list: describe one or start from a template, then every workflow with its trigger, last run and what needs you.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Zap, Clock, Play, ArrowUp, MoreHorizontal, Pencil, Copy, Trash2, Sparkles, ChevronRight, Link2, Eye, FileInput, Pause, CheckCircle2, AlertTriangle, Hourglass, Loader2, LayoutTemplate } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates, type Workflow, type Run } from '@/lib/data'
import { startRun } from '@/lib/runner'
import { brickOf } from '@/lib/flow'
import { Button, Chip, Confirm, Field, Modal, PageHeader, SearchBox, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const statusLabel: Record<Workflow['status'], string> = { live: 'Live', draft: 'Draft', paused: 'Paused' }
const triggerMeta = (w: Pick<Workflow, 'triggerType' | 'schedule' | 'watch'>) => w.triggerType === 'schedule' ? { icon: Clock, text: w.schedule?.every === 'week' ? `Every ${DAYS[w.schedule.day ?? 1]} at ${w.schedule.at}` : `Every ${w.schedule?.every} at ${w.schedule?.at}` } : w.triggerType === 'link' ? { icon: Link2, text: 'By link' } : w.triggerType === 'watch' ? { icon: Eye, text: `Watches ${(() => { try { return new URL(w.watch?.url ?? '').hostname } catch { return 'a page' } })()}` } : w.triggerType === 'event' ? { icon: FileInput, text: 'When a document is added' } : { icon: Zap, text: 'By hand' }
const runTone = (s: Run['status']) => (s === 'waiting' ? 'warn' : s === 'failed' || s === 'rejected' ? 'danger' : s === 'running' ? 'accent' : 'ok') as 'warn' | 'danger' | 'accent' | 'ok'
const runWord: Record<Run['status'], string> = { running: 'Running', waiting: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', failed: 'Failed', completed: 'Done' }

function StepChain({ w, size = 22 }: { w: { nodes: { data: { brick: string } }[] }; size?: number }) {
  const bricks = w.nodes.map((n) => brickOf(n.data.brick as any))
  return (
    <span className="inline-flex items-center gap-1">
      {bricks.slice(0, 7).map((b, i) => <span key={i} className="inline-flex items-center gap-1" title={b.label}><Tile color={b.color} size={size} radius={Math.round(size * 0.32)}><b.icon size={Math.round(size * 0.5)} /></Tile>{i < Math.min(bricks.length, 7) - 1 && <span className="w-2 h-px bg-[var(--line)]" />}</span>)}
      {bricks.length > 7 && <span className="text-[11px] muted ml-1">+{bricks.length - 7}</span>}
    </span>
  )
}

export default function Workflows() {
  const nav = useNavigate()
  const user = useUser()!
  const { workflows, runs, apiKey, upsertWorkflow, deleteWorkflow } = useApp()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | 'live' | 'paused' | 'draft' | 'attention'>('all')
  const [pick, setPick] = useState(false)
  const [runFor, setRunFor] = useState<Workflow | null>(null)
  const [input, setInput] = useState('')
  const [starting, setStarting] = useState(false)
  const [ask, setAsk] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Workflow | null>(null)
  const editable = can(user, 'build')
  const canRun = user.role !== 'auditor'
  const byWf = useMemo(() => { const m = new Map<string, Run[]>(); for (const r of runs) { if (r.kind === 'chat') continue; m.set(r.workflowId, [...(m.get(r.workflowId) ?? []), r]) } return m }, [runs])
  const attention = (w: Workflow) => (byWf.get(w.id) ?? []).filter((r) => r.status === 'waiting' || r.status === 'failed').length
  const list = useMemo(() => workflows.filter((w) => (tab === 'all' || (tab === 'live' ? w.status === 'live' : tab === 'paused' ? w.status === 'paused' : tab === 'draft' ? w.status === 'draft' : attention(w) > 0)) && (w.name + ' ' + w.description).toLowerCase().includes(q.toLowerCase())), [workflows, tab, q, byWf]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = workflows.filter((w) => w.status === 'live').length
  const paused = workflows.filter((w) => w.status === 'paused').length
  const drafts = workflows.filter((w) => w.status === 'draft').length
  const needs = workflows.filter((w) => attention(w) > 0).length

  const run = async () => { if (!runFor || !input.trim()) return; setStarting(true); const r = await startRun(runFor, input.trim(), 'Manual', () => { setStarting(false); setRunFor(null); setInput('') }); nav(`/runs?open=${r.id}`) }
  const build = () => { const t = ask.trim(); if (!t) return; nav(`/workflows/new?template=blank&build=${encodeURIComponent(t)}`) }
  const duplicate = (w: Workflow) => { const c: Workflow = { ...w, id: `wf-${Date.now().toString(36)}`, name: `${w.name} copy`, status: 'draft', version: 1, lastRunAt: undefined }; upsertWorkflow(c); nav(`/workflows/${c.id}`) }
  const toggleLive = (w: Workflow) => upsertWorkflow({ ...w, status: w.status === 'live' ? 'paused' : 'live', version: w.version + 1 })
  const empty = workflows.length === 0
  const templates = workflowTemplates.filter((t) => t.id !== 'blank')

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4">
      <div onClick={() => setMenu(null)}>
        <PageHeader title="Workflows" subtitle="Chain agents, conditions, loops, branches and approvals. Run them by hand, on a schedule, by link or on events." actions={editable && <Button variant="primary" onClick={() => setPick(true)}><Plus size={15} /> New workflow</Button>} />

        {editable && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx('clay mb-6', empty ? 'p-7' : 'p-4')}>
            {empty && <div className="mb-4"><div className="display text-[22px] font-bold leading-tight">What should happen, step by step?</div><div className="text-[13px] muted mt-1">Describe it in a sentence. The Co-Create Assistant lays out the steps on a canvas, and you refine and test them.</div></div>}
            <div className="flat flex items-center gap-2 pl-4 pr-2 h-12 focus-within:border-[var(--accent)]">
              <Sparkles size={15} className="accent-ink shrink-0" />
              <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && build()} disabled={!apiKey} placeholder={apiKey ? 'Research a competitor every Monday, summarise what changed, and notify me if prices moved' : 'Models are not available right now'} aria-label="Describe a workflow" className="flex-1 bg-transparent outline-0 text-[13.5px]" />
              <button aria-label="Build this workflow" onClick={build} disabled={!ask.trim() || !apiKey} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button>
            </div>
            <div className={cx('flex items-center gap-2 flex-wrap', empty ? 'mt-5' : 'mt-3')}>
              <span className="text-[11.5px] font-semibold muted shrink-0 inline-flex items-center gap-1 mr-1"><LayoutTemplate size={12} /> Start from</span>
              {templates.map((t) => {
                const tm = triggerMeta(t); return (
                  <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} title={t.desc} className="flat shrink-0 h-10 pl-2 pr-3 flex items-center gap-2.5 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:-translate-y-px transition-all">
                    <StepChain w={t} size={18} /><span className="text-[12.5px] font-semibold whitespace-nowrap">{t.name}</span><tm.icon size={12} className="muted" />
                  </button>
                )
              })}
              <button onClick={() => nav('/workflows/new?template=blank')} className="flat shrink-0 h-10 px-3 flex items-center gap-2 text-[12.5px] font-semibold muted hover:text-[var(--text)] hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] transition-all"><Plus size={13} /> Blank canvas</button>
            </div>
          </motion.div>
        )}

        {!empty && (
          <>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <Segmented value={tab} onChange={setTab} items={[{ id: 'all', label: <>All <span className="muted">{workflows.length}</span></> }, { id: 'live', label: <>Live <span className="muted">{live}</span></> }, ...(paused > 0 || tab === 'paused' ? [{ id: 'paused' as const, label: <>Paused <span className="muted">{paused}</span></> }] : []), { id: 'draft', label: <>Drafts <span className="muted">{drafts}</span></> }, { id: 'attention', label: <>Needs you{needs > 0 && <span className="ml-1.5 inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--warn)] text-white text-[10.5px]">{needs}</span>}</> }]} />
              <SearchBox value={q} onChange={setQ} placeholder="Search" className="w-[220px]" />
            </div>
            <Stagger className="flex flex-col gap-2.5" delay={0.04}>
              {list.length === 0 && <div className="clay py-12 text-center text-[12.5px] muted">{tab === 'attention' ? 'Nothing needs you.' : 'Nothing matches.'}</div>}
              {list.map((w) => {
                const wr = byWf.get(w.id) ?? []
                const waiting = wr.filter((r) => r.status === 'waiting').length
                const failed = wr.filter((r) => r.status === 'failed').length
                const last = wr[0]
                const tm = triggerMeta(w)
                return (
                  <Item key={w.id}>
                    <div className="clay-sm px-4 py-3.5 flex items-center gap-4 hover:-translate-y-px transition-transform relative">
                      <Tile color={w.status === 'live' ? '#10b981' : w.status === 'paused' ? '#f59e0b' : '#64748b'} size={40} radius={12}><tm.icon size={17} /></Tile>
                      <button onClick={() => nav(`/workflows/${w.id}`)} className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 text-[14px] font-semibold flex-wrap">{w.name}<Chip tone={w.status === 'live' ? 'ok' : w.status === 'paused' ? 'warn' : undefined}>{statusLabel[w.status]} · v{w.version}</Chip>{waiting > 0 && <Chip tone="warn"><Hourglass size={11} /> {waiting} waiting for approval</Chip>}{failed > 0 && <Chip tone="danger"><AlertTriangle size={11} /> {failed} failed</Chip>}</div>
                        <div className="text-[12.5px] muted truncate mt-0.5">{w.description || `${w.nodes.length} steps`}</div>
                        <div className="flex items-center gap-3 mt-2.5 text-[11.5px] muted flex-wrap">
                          <StepChain w={w} />
                          <span className="inline-flex items-center gap-1"><tm.icon size={11} /> {tm.text}</span>
                          <span>·</span><span>{wr.length} run{wr.length === 1 ? '' : 's'}</span>
                          {last && <><span>·</span><span className="inline-flex items-center gap-1">Last {last.started.slice(5)} <span className={cx('inline-flex items-center gap-1 font-medium', last.status === 'failed' || last.status === 'rejected' ? 'text-[var(--danger)]' : last.status === 'waiting' ? 'text-[var(--warn)]' : last.status === 'running' ? 'accent-ink' : 'text-[var(--ok)]')}>{last.status === 'running' ? <Loader2 size={11} className="animate-spin" /> : last.status === 'failed' ? <AlertTriangle size={11} /> : last.status === 'waiting' ? <Hourglass size={11} /> : <CheckCircle2 size={11} />} {runWord[last.status]}</span></span></>}
                        </div>
                      </button>
                      {canRun && <Button size="sm" onClick={() => { setRunFor(w); setInput(w.schedule?.input ?? w.watch?.input ?? '') }} disabled={!apiKey && w.nodes.some((n) => n.data.brick !== 'trigger')} title="Run with an input"><Play size={12} /> Run</Button>}
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button aria-label="More actions" aria-expanded={menu === w.id} onClick={() => setMenu(menu === w.id ? null : w.id)} className="btn btn-ghost btn-sm btn-icon"><MoreHorizontal size={15} /></button>
                        <AnimatePresence>{menu === w.id && (
                          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-1 w-[200px] pop rounded-[14px] p-1.5 z-20">
                            <button onClick={() => nav(`/workflows/${w.id}`)} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Pencil size={14} /> Open</button>
                            {editable && w.status !== 'draft' && <button onClick={() => { setMenu(null); toggleLive(w) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]">{w.status === 'live' ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}</button>}
                            {editable && <button onClick={() => { setMenu(null); duplicate(w) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
                            {wr.length > 0 && <button onClick={() => nav(`/runs?open=${wr[0].id}`)} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><ChevronRight size={14} /> Last run</button>}
                            {editable && <><div className="h-px bg-[var(--line)] my-1" /><button onClick={() => { setMenu(null); setToDelete(w) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] text-[var(--danger)] hover:bg-[var(--clay-dark)]"><Trash2 size={14} /> Delete</button></>}
                          </motion.div>
                        )}</AnimatePresence>
                      </div>
                      <ChevronRight size={15} className="muted" />
                    </div>
                  </Item>
                )
              })}
            </Stagger>
          </>
        )}
      </div>

      <Modal open={pick} onClose={() => setPick(false)} title="New workflow" width={640}>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {workflowTemplates.map((t) => {
            const tm = triggerMeta(t); return (
              <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} className="flat p-4 text-left hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{t.name}</span><span className="chip"><tm.icon size={11} /> {tm.text}</span></div>
                {t.nodes.length ? <StepChain w={t} size={20} /> : <span className="text-[11.5px] muted">Empty canvas</span>}
                <span className="text-[12px] muted leading-snug">{t.desc}</span>
              </button>
            )
          })}
        </div>
        <div className="text-[12px] muted mt-4 flex items-center gap-1.5"><Sparkles size={12} className="accent-ink" /> Or describe the workflow in the box on the Workflows page and let the assistant build it.</div>
      </Modal>
      <Modal open={!!runFor} onClose={() => setRunFor(null)} title={`Run ${runFor?.name ?? ''}`} width={520}>
        <div className="flex flex-col gap-4">
          <Field label="Input" hint="Becomes {{input}}, which every step can see."><Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="What should this run work on?" /></Field>
          <div className="flex justify-end"><Button variant="primary" onClick={run} disabled={!input.trim() || starting}><Play size={13} /> {starting ? 'Starting…' : 'Run now'}</Button></div>
        </div>
      </Modal>
      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name}?`} danger confirmLabel="Delete" body="Past runs stay under Runs. Schedules stop." onConfirm={() => toDelete && deleteWorkflow(toDelete.id)} />
    </Page>
  )
}
