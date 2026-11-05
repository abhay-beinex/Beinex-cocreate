import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Zap, Clock, Play, ArrowUp, MoreHorizontal, Pencil, Copy, Trash2, Sparkles, ChevronRight } from 'lucide-react'
import { useApp, useUser, can } from '@/store/app'
import { workflowTemplates, type Workflow } from '@/lib/data'
import { startRun } from '@/lib/runner'
import { BRICKS, brickOf } from '@/lib/flow'
import { Button, Chip, Confirm, Dot, Field, Modal, PageHeader, SearchBox, Segmented, Textarea, Tile, cx } from '@/components/ui'
import { Page, Stagger, Item } from '@/components/motion'

const statusLabel: Record<Workflow['status'], string> = { live: 'Live', draft: 'Draft', paused: 'Paused' }

function StepChain({ w, size = 22 }: { w: { nodes: { data: { brick: string } }[] }; size?: number }) {
  const bricks = w.nodes.map((n) => brickOf(n.data.brick as any))
  return (
    <span className="inline-flex items-center gap-1">
      {bricks.slice(0, 7).map((b, i) => <span key={i} className="inline-flex items-center gap-1"><Tile color={b.color} size={size} radius={Math.round(size * 0.32)}><b.icon size={Math.round(size * 0.5)} /></Tile>{i < Math.min(bricks.length, 7) - 1 && <span className="w-2 h-px bg-[var(--line)]" />}</span>)}
      {bricks.length > 7 && <span className="text-[11px] muted ml-1">+{bricks.length - 7}</span>}
    </span>
  )
}

export default function Workflows() {
  const nav = useNavigate()
  const user = useUser()!
  const { workflows, runs, apiKey, upsertWorkflow, deleteWorkflow } = useApp()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<'all' | 'live' | 'draft'>('all')
  const [pick, setPick] = useState(false)
  const [runFor, setRunFor] = useState<Workflow | null>(null)
  const [input, setInput] = useState('')
  const [starting, setStarting] = useState(false)
  const [ask, setAsk] = useState('')
  const [menu, setMenu] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Workflow | null>(null)
  const editable = can(user, 'build')
  const list = useMemo(() => workflows.filter((w) => (tab === 'all' || (tab === 'live' ? w.status === 'live' : w.status !== 'live')) && (w.name + ' ' + w.description).toLowerCase().includes(q.toLowerCase())), [workflows, tab, q])
  const live = workflows.filter((w) => w.status === 'live').length

  const run = async () => { if (!runFor || !input.trim()) return; setStarting(true); const r = await startRun(runFor, input.trim(), 'Manual', () => { setStarting(false); setRunFor(null); setInput('') }); nav(`/runs?open=${r.id}`) }
  const build = () => { const t = ask.trim(); if (!t) return; nav(`/workflows/new?template=blank&build=${encodeURIComponent(t)}`) }
  const duplicate = (w: Workflow) => { const c: Workflow = { ...w, id: `wf-${Date.now().toString(36)}`, name: `${w.name} copy`, status: 'draft', version: 1, lastRunAt: undefined }; upsertWorkflow(c); nav(`/workflows/${c.id}`) }
  const empty = workflows.length === 0

  return (
    <Page className="max-w-[1080px] mx-auto pt-8 pb-16 px-4" >
      <div onClick={() => setMenu(null)}>
      <PageHeader title="Workflows" subtitle="Chain agents, conditions, actions and approvals. Run them by hand or on a schedule." actions={editable && !empty && <Button variant="primary" onClick={() => setPick(true)}><Plus size={15} /> New workflow</Button>} />

      {editable && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cx('clay mb-6', empty ? 'p-7' : 'p-3')}>
          {empty && <div className="mb-4"><div className="display text-[20px] font-bold leading-tight">What should happen, step by step?</div><div className="text-[13px] muted mt-1">Describe it in a sentence. The Co-Create Assistant lays out the steps on a canvas, and you refine and test them.</div></div>}
          <div className="flat flex items-center gap-2 pl-4 pr-2 h-12 focus-within:border-[var(--accent)]">
            <Sparkles size={15} className="accent-ink shrink-0" />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && build()} disabled={!apiKey} placeholder={apiKey ? 'Research a competitor every Monday, summarise what changed, and notify me if prices moved' : 'Models are not available right now'} className="flex-1 bg-transparent outline-0 text-[13.5px]" />
            <button aria-label="Build this workflow" onClick={build} disabled={!ask.trim() || !apiKey} className="btn btn-primary btn-sm btn-icon !rounded-full"><ArrowUp size={14} /></button>
          </div>
          {empty && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-5">
              {workflowTemplates.map((t) => (
                <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} className="flat p-3.5 text-left hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] hover:-translate-y-px transition-all flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-semibold">{t.name}</span>{t.triggerType === 'schedule' && <Clock size={13} className="muted" />}</div>
                  {t.nodes.length ? <StepChain w={t} size={20} /> : <span className="text-[11.5px] muted">Empty canvas</span>}
                  <span className="text-[11.5px] muted leading-snug">{t.desc}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {!empty && (
        <>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Segmented value={tab} onChange={setTab} items={[{ id: 'all', label: <>All <span className="muted">{workflows.length}</span></> }, { id: 'live', label: <>Live <span className="muted">{live}</span></> }, { id: 'draft', label: <>Drafts <span className="muted">{workflows.length - live}</span></> }]} />
            <SearchBox value={q} onChange={setQ} placeholder="Search" className="w-[220px]" />
          </div>
          <Stagger className="flex flex-col gap-2.5" delay={0.04}>
            {list.length === 0 && <div className="clay py-12 text-center text-[12.5px] muted">Nothing matches.</div>}
            {list.map((w) => {
              const wr = runs.filter((r) => r.workflowId === w.id)
              const waiting = wr.filter((r) => r.status === 'waiting').length
              const last = wr[0]
              return (
                <Item key={w.id}>
                  <div className="clay-sm px-4 py-3.5 flex items-center gap-4 hover:-translate-y-px transition-transform relative">
                    <button onClick={() => nav(`/workflows/${w.id}`)} className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 text-[14px] font-semibold"><Dot tone={w.status === 'live' ? 'ok' : w.status === 'paused' ? 'warn' : 'muted'} />{w.name}<span className="text-[11px] muted font-normal">{statusLabel[w.status]} · v{w.version}</span>{waiting > 0 && <Chip tone="warn">{waiting} waiting</Chip>}</div>
                      <div className="text-[12.5px] muted truncate mt-0.5">{w.description || `${w.nodes.length} steps`}</div>
                      <div className="flex items-center gap-3 mt-2.5 text-[11.5px] muted">
                        <StepChain w={w} />
                        <span className="inline-flex items-center gap-1">{w.triggerType === 'schedule' ? <><Clock size={11} /> Every {w.schedule?.every} at {w.schedule?.at}</> : <><Zap size={11} /> By hand</>}</span>
                        <span>·</span><span>{wr.length} run{wr.length === 1 ? '' : 's'}</span>
                        {last && <><span>·</span><span>Last {last.started.slice(5)}</span></>}
                      </div>
                    </button>
                    <Button size="sm" onClick={() => { setRunFor(w); setInput(w.schedule?.input ?? '') }} disabled={!apiKey && w.nodes.some((n) => n.data.brick !== 'trigger')}><Play size={12} /> Run</Button>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button aria-label="More actions" aria-expanded={menu === w.id} onClick={() => setMenu(menu === w.id ? null : w.id)} className="btn btn-ghost btn-sm btn-icon"><MoreHorizontal size={15} /></button>
                      <AnimatePresence>{menu === w.id && (
                        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 top-full mt-1 w-[180px] pop rounded-[14px] p-1.5 z-20">
                          <button onClick={() => nav(`/workflows/${w.id}`)} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Pencil size={14} /> Open</button>
                          {editable && <button onClick={() => { setMenu(null); duplicate(w) }} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[10px] text-[13px] hover:bg-[var(--clay-dark)]"><Copy size={14} /> Duplicate</button>}
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

      <Modal open={pick} onClose={() => setPick(false)} title="New workflow" width={620}>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {workflowTemplates.map((t) => (
            <button key={t.id} onClick={() => nav(`/workflows/new?template=${t.id}`)} className="flat p-4 text-left hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--line))] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{t.name}</span>{t.triggerType === 'schedule' && <span className="chip"><Clock size={11} /> scheduled</span>}</div>
              {t.nodes.length ? <StepChain w={t} size={20} /> : <span className="text-[11.5px] muted">Empty canvas</span>}
              <span className="text-[12px] muted leading-snug">{t.desc}</span>
            </button>
          ))}
        </div>
        <div className="text-[12px] muted mt-4 flex items-center gap-1.5"><Sparkles size={12} className="accent-ink" /> Or describe the workflow in the box on the Workflows page and let the assistant build it.</div>
      </Modal>
      <Modal open={!!runFor} onClose={() => setRunFor(null)} title={`Run ${runFor?.name ?? ''}`} width={520}>
        <div className="flex flex-col gap-4">
          <Field label="Input" hint="Becomes the first message of the run."><Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="What should this run work on?" /></Field>
          <div className="flex justify-end"><Button variant="primary" onClick={run} disabled={!input.trim() || starting}><Play size={13} /> {starting ? 'Starting…' : 'Run now'}</Button></div>
        </div>
      </Modal>
      <Confirm open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name}?`} danger confirmLabel="Delete" body="Past runs stay under Runs. Schedules stop." onConfirm={() => toDelete && deleteWorkflow(toDelete.id)} />
    </Page>
  )
}
